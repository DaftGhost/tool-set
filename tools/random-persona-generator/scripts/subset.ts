import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { datasetVersion, parseFields } from '../src/dataContract.ts'
import { prepareDatabase, exportSql } from './datasetPackage.ts'
import type { SourceFile } from './datasetPackage.ts'

// Hash ranking selects across the source population without depending on its iteration order.
export function selectSubset(rows: { sample_id: number; uuid: string }[], count: number, seed: string) {
  if (!Number.isSafeInteger(count) || count < 1 || count > rows.length) throw new Error('Invalid subset size')
  return rows.map(row => ({ id: row.sample_id, hash: createHash('sha256').update(`${seed}:${row.uuid}`).digest('hex') }))
    .sort((a, b) => a.hash.localeCompare(b.hash) || a.id - b.id).slice(0, count).map(row => row.id).sort((a, b) => a - b)
}

export async function prepareSubset(input: string, output: string, count: number) {
  if (path.resolve(input) === path.resolve(output, 'personas.sqlite')) throw new Error('Subset must use a separate database')
  const sourceDb = new DatabaseSync(input, { readOnly: true })
  try {
    const metadata = sourceDb.prepare('SELECT * FROM dataset_metadata WHERE id = 1').get()!
    if (metadata?.dataset_version !== datasetVersion || metadata.status !== 'ready') throw new Error('Source dataset is not ready')
    const population = sourceDb.prepare('SELECT sample_id, uuid FROM personas ORDER BY sample_id').all()
      .map(row => ({ sample_id: Number(row.sample_id), uuid: String(row.uuid) }))
    if (population.length !== metadata.row_count) throw new Error('Source population mismatch')
    const seed = `${datasetVersion}:deployment-subset-v1`
    const selected = selectSubset(population, count, seed)
    const read = sourceDb.prepare('SELECT * FROM personas WHERE sample_id = ?')
    async function* rows() { for (const id of selected) yield parseFields(read.get(id)) }
    const prepared = await prepareDatabase({ rows: rows(), output, files: JSON.parse(String(metadata.files_json)) as SourceFile[], expectedRows: count })
    if (prepared.audit.databaseBytes >= 450000000) throw new Error('Subset exceeds the reviewed free-tier storage budget')
    const selection = { algorithm: 'SHA-256(seed:uuid) ascending, source order retained', seed, sourceRows: population.length,
      selectedRows: count, sourceFieldsSha256: metadata.fields_sha256, selectedFieldsSha256: prepared.audit.fieldsSha256, sourceSampleIds: selected }
    await writeFile(path.join(output, 'selection.json'), JSON.stringify(selection, null, 2) + '\n')
    const manifest = await exportSql(prepared.database, output)
    return { directory: output, rows: count, databaseBytes: prepared.audit.databaseBytes, fieldsSha256: manifest.fieldsSha256, sqlBatches: manifest.batches.length }
  } finally { sourceDb.close() }
}
