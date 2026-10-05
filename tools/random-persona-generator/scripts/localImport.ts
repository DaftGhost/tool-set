import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { canonicalFields, datasetVersion, parseFields } from '../src/dataContract.ts'
import type { SqlPackage } from './sqlExport.ts'

const checksum = (content: string) => createHash('sha256').update(content).digest('hex')
async function checkedSql(directory: string, file: string, expectedHash: string) {
  if (!/^sql\/(?:\d{5}|ready)\.sql$/.test(file)) throw new Error('Invalid package path')
  const content = await readFile(path.join(directory, file), 'utf8')
  if (checksum(content) !== expectedHash) throw new Error(`SQL checksum mismatch: ${file}`)
  return content
}

export async function importSqlPackage(directory: string, database: Pick<D1Database, 'prepare' | 'exec'>, onProgress?: (rows: number) => void) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'sql-package.json'), 'utf8')) as SqlPackage
  const sourceDb = new DatabaseSync(path.join(directory, 'personas.sqlite'), { readOnly: true })
  try {
    const metadata = sourceDb.prepare('SELECT * FROM dataset_metadata WHERE id = 1').get()!
    if (manifest.datasetVersion !== datasetVersion || metadata.dataset_version !== datasetVersion || metadata.status !== 'ready'
      || manifest.rowCount !== metadata.row_count || manifest.fieldsSha256 !== metadata.fields_sha256) throw new Error('SQL package inventory mismatch')
    const ready = await checkedSql(directory, manifest.readyFile, manifest.readySha256)
    let nextRow = 0
    for (const [index, batch] of manifest.batches.entries()) {
      if (batch.file !== `sql/${String(index).padStart(5, '0')}.sql` || batch.firstRow !== nextRow || !Number.isSafeInteger(batch.rowCount) || batch.rowCount < 1) throw new Error('SQL batch range mismatch')
      nextRow += batch.rowCount
    }
    if (nextRow !== manifest.rowCount) throw new Error('SQL package row count mismatch')
    const schema = (await readFile(new URL('../migrations/0001_personas.sql', import.meta.url), 'utf8')).split(';').map(statement => statement.trim().replace(/\s+/g, ' ')).filter(Boolean).join(';\n') + ';'
    await database.exec(schema)
    const existing = await database.prepare('SELECT * FROM dataset_metadata WHERE id = 1').first<Record<string, unknown>>()
    if (existing && (existing.dataset_version !== datasetVersion || existing.files_json !== metadata.files_json || existing.row_count !== manifest.rowCount)) throw new Error('Target D1 inventory mismatch; use a separate database for a new version')
    const alreadyReady = existing?.status === 'ready'
    if (alreadyReady && existing.fields_sha256 !== manifest.fieldsSha256) throw new Error('Target D1 digest mismatch')
    let cursor = 0
    const progressPath = path.join(directory, 'local-import-progress.json')
    const progress = await readFile(progressPath, 'utf8').catch(() => '')
    if (progress) {
      const saved = JSON.parse(progress)
      if (saved.datasetVersion !== datasetVersion || saved.fieldsSha256 !== manifest.fieldsSha256) throw new Error('Import continuation inventory mismatch')
      cursor = saved.completedBatches
      if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > manifest.batches.length) throw new Error('Invalid import cursor')
    }
    let verifiedRows = 0
    for (const [index, batch] of manifest.batches.entries()) {
      const content = await checkedSql(directory, batch.file, batch.sha256)
      if (Buffer.byteLength(content) !== batch.bytes) throw new Error('SQL batch byte count mismatch')
      const end = batch.firstRow + batch.rowCount
      let target = await database.prepare('SELECT * FROM personas WHERE sample_id >= ? AND sample_id < ? ORDER BY sample_id').bind(batch.firstRow, end).all<Record<string, unknown>>()
      if (!alreadyReady && (index >= cursor || target.results.length !== batch.rowCount)) {
        await database.exec(content)
        target = await database.prepare('SELECT * FROM personas WHERE sample_id >= ? AND sample_id < ? ORDER BY sample_id').bind(batch.firstRow, end).all<Record<string, unknown>>()
      }
      if (target.results.length !== batch.rowCount) throw new Error(`Target row count mismatch: ${batch.file}`)
      for (const row of target.results) {
        const expected = sourceDb.prepare('SELECT * FROM personas WHERE sample_id = ?').get(Number(row.sample_id))!
        if (!expected || canonicalFields(parseFields(row)) !== canonicalFields(parseFields(expected)) || row.source_hash !== expected.source_hash
          || row.skills_json !== expected.skills_json || row.hobbies_json !== expected.hobbies_json) throw new Error(`Target field mismatch: ${row.sample_id}`)
      }
      verifiedRows += batch.rowCount
      await writeFile(progressPath, JSON.stringify({ datasetVersion, fieldsSha256: manifest.fieldsSha256, completedBatches: index + 1, verifiedRows }) + '\n')
      onProgress?.(verifiedRows)
    }
    const count = await database.prepare('SELECT COUNT(*) AS count, MIN(sample_id) AS first, MAX(sample_id) AS last FROM personas').first<Record<string, unknown>>()
    if (count?.count !== manifest.rowCount || count.first !== 0 || count.last !== manifest.rowCount - 1) throw new Error('Target total or continuous row index mismatch')
    if (!alreadyReady) await database.exec(ready)
    const result = { datasetVersion, verifiedRows, fieldsSha256: manifest.fieldsSha256, storage: 'local D1 emulation', publishedRemotely: false }
    await writeFile(path.join(directory, 'local-import-verification.json'), JSON.stringify(result, null, 2) + '\n')
    return result
  } finally { sourceDb.close() }
}
