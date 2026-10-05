import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { datasetVersion, fieldNames } from '../src/dataContract.ts'

export interface SqlBatch { file: string; bytes: number; sha256: string; firstRow: number; rowCount: number }
export interface SqlPackage { datasetVersion: string; rowCount: number; fieldsSha256: string; batches: SqlBatch[]; readyFile: string; readySha256: string }
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

// Hex-encoded UTF-8 keeps literal newlines, NULs and quotes intact in one-line D1 statements.
function sqlValue(value: unknown): string {
  if (typeof value === 'string') return `CAST(X'${Buffer.from(value, 'utf8').toString('hex')}' AS TEXT)`
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  throw new Error('Unsupported SQLite value')
}
const metadataColumns = ['id', 'dataset_version', 'dataset_name', 'split', 'row_count', 'status', 'files_json', 'fields_sha256']
function metadataSql(row: Record<string, unknown>, ready: boolean) {
  if (ready) return `UPDATE dataset_metadata SET status = 'ready', fields_sha256 = ${sqlValue(row.fields_sha256)} WHERE id = 1;\n`
  return `INSERT OR IGNORE INTO dataset_metadata (${metadataColumns.join(',')}) VALUES (${metadataColumns.map(key => sqlValue(key === 'status' ? 'preparing' : key === 'fields_sha256' ? '' : row[key])).join(',')});\n`
}

export async function exportSql(database: string, output: string, maxBatchBytes = 8 * 1024 * 1024) {
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    const metadata = db.prepare('SELECT * FROM dataset_metadata WHERE id = 1').get()!
    if (metadata.status !== 'ready' || metadata.dataset_version !== datasetVersion) throw new Error('Only verified datasets may be exported')
    await mkdir(path.join(output, 'sql'), { recursive: true })
    const columns = ['sample_id', ...fieldNames, 'source_hash', 'skills_json', 'hobbies_json']
    const schema = (await readFile(new URL('../migrations/0001_personas.sql', import.meta.url), 'utf8')).split(';').map(statement => statement.trim().replace(/\s+/g, ' ')).filter(Boolean).join(';\n') + ';'
    let content = schema + '\n' + metadataSql(metadata, false)
    let firstRow = 0, rowCount = 0, contentBytes = Buffer.byteLength(content)
    const batches: SqlBatch[] = []
    async function flush() {
      const file = `sql/${String(batches.length).padStart(5, '0')}.sql`
      await writeFile(path.join(output, file), content)
      batches.push({ file, bytes: Buffer.byteLength(content), sha256: sha256(content), firstRow, rowCount })
      firstRow += rowCount; rowCount = 0; content = ''; contentBytes = 0
    }
    for (const row of db.prepare('SELECT * FROM personas ORDER BY sample_id').iterate()) {
      const statement = `INSERT OR IGNORE INTO personas (${columns.join(',')}) VALUES (${columns.map(key => sqlValue(row[key])).join(',')});\n`
      if (Buffer.byteLength(statement) > 100000) throw new Error(`D1 SQL statement too large at row ${row.sample_id}`)
      const statementBytes = Buffer.byteLength(statement)
      if (contentBytes + statementBytes > maxBatchBytes && rowCount) await flush()
      content += statement; contentBytes += statementBytes; rowCount += 1
    }
    if (content) await flush()
    if (firstRow !== metadata.row_count) throw new Error('SQL export row count mismatch')
    const readyFile = 'sql/ready.sql', ready = metadataSql(metadata, true)
    await writeFile(path.join(output, readyFile), ready)
    const manifest: SqlPackage = { datasetVersion, rowCount: firstRow, fieldsSha256: String(metadata.fields_sha256), batches, readyFile, readySha256: sha256(ready) }
    await writeFile(path.join(output, 'sql-package.json'), JSON.stringify(manifest, null, 2) + '\n')
    return manifest
  } finally { db.close() }
}
