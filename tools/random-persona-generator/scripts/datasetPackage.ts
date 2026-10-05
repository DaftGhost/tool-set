import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { canonicalFields, datasetName, datasetVersion, fieldNames, objectValue, parseFields, sourceLists, normalizedListFields } from '../src/dataContract.ts'
export { exportSql } from './sqlExport.ts'

export interface SourceFile { name: string; sha256: string; bytes: number; rows: number }
interface Preparation {
  rows: AsyncIterable<unknown>
  output: string
  files: SourceFile[]
  expectedRows: number
  batchRows?: number
  onProgress?: (rows: number) => void
}
export interface DatasetAudit {
  dataset: string; datasetVersion: string; verifiedRows: number; sourceFields: number
  fieldsSha256: string; emptyFields: Record<string, number>; ages: Record<string, number>
  normalizedListWrappers: number; ageNeedsReview: number; ageNeedsReviewExamples: string[]; maxRowBytes: number
  databaseBytes: number; files: SourceFile[]; queryPlan: unknown[]
}

function sourceFields(value: unknown) {
  const raw = objectValue(value)
  if (Object.keys(raw).length !== fieldNames.length) throw new Error('Source field set differs')
  return parseFields({ ...raw, age: typeof raw.age === 'bigint' ? Number(raw.age) : raw.age })
}

export async function prepareDatabase(options: Preparation) {
  await mkdir(options.output, { recursive: true })
  const database = path.join(options.output, 'personas.sqlite')
  const db = new DatabaseSync(database)
  const schema = await readFile(new URL('../migrations/0001_personas.sql', import.meta.url), 'utf8')
  const audit: DatasetAudit = {
    dataset: datasetName, datasetVersion, verifiedRows: 0, sourceFields: fieldNames.length, fieldsSha256: '',
    emptyFields: Object.fromEntries(fieldNames.map(key => [key, 0])), ages: {}, ageNeedsReview: 0, ageNeedsReviewExamples: [],
    normalizedListWrappers: 0, maxRowBytes: 0, databaseBytes: 0, files: options.files, queryPlan: [],
  }
  let transaction = false
  try {
    db.exec(schema)
    const old = db.prepare('SELECT * FROM dataset_metadata WHERE id = 1').get()
    const fileInventory = JSON.stringify(options.files)
    if (old && (old.dataset_version !== datasetVersion || old.files_json !== fileInventory || old.row_count !== options.expectedRows)) throw new Error('Existing dataset inventory mismatch')
    if (!old) db.prepare('INSERT INTO dataset_metadata VALUES (1, ?, ?, ?, ?, ?, ?, ?)').run(datasetVersion, datasetName, 'train', options.expectedRows, 'preparing', fileInventory, '')
    const wasReady = old?.status === 'ready'
    const columns = ['sample_id', ...fieldNames, 'source_hash', 'skills_json', 'hobbies_json']
    const insert = db.prepare(`INSERT INTO personas (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    const read = db.prepare('SELECT * FROM personas WHERE sample_id = ?')
    const digest = createHash('sha256')
    db.exec('BEGIN IMMEDIATE'); transaction = true
    for await (const raw of options.rows) {
      const row = audit.verifiedRows
      try {
        const fields = sourceFields(raw)
        const canonical = canonicalFields(fields)
        const bytes = Buffer.from(canonical)
        const sourceHash = createHash('sha256').update(bytes).digest('hex')
        const lists = sourceLists(fields)
        audit.normalizedListWrappers += normalizedListFields(fields).length
        const skillsJson = JSON.stringify(lists.skills), hobbiesJson = JSON.stringify(lists.hobbies)
        const existing = read.get(row)
        if (!existing) {
          if (wasReady) throw new Error('Immutable dataset has a missing row')
          insert.run(row, ...fieldNames.map(key => fields[key]), sourceHash, skillsJson, hobbiesJson)
        }
        const stored = existing ?? read.get(row)!
        if (canonicalFields(parseFields(stored)) !== canonical || stored.source_hash !== sourceHash
          || stored.skills_json !== skillsJson || stored.hobbies_json !== hobbiesJson) throw new Error('Stored source field mismatch')
        const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(bytes.length)); digest.update(length).update(bytes)
        for (const key of fieldNames) if (fields[key] === '') audit.emptyFields[key] += 1
        audit.ages[fields.age] = (audit.ages[fields.age] ?? 0) + 1
        if (fields.age <= 0) { audit.ageNeedsReview += 1; if (audit.ageNeedsReviewExamples.length < 100) audit.ageNeedsReviewExamples.push(fields.uuid) }
        audit.maxRowBytes = Math.max(audit.maxRowBytes, bytes.length + Buffer.byteLength(skillsJson) + Buffer.byteLength(hobbiesJson) + 64)
        audit.verifiedRows += 1
      } catch (error) {
        throw new Error(`Source row ${row}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
      }
      if (audit.verifiedRows % (options.batchRows ?? 2000) === 0) {
        db.exec('COMMIT'); transaction = false
        options.onProgress?.(audit.verifiedRows)
        db.exec('BEGIN IMMEDIATE'); transaction = true
      }
    }
    const count = db.prepare('SELECT COUNT(*) AS count, MIN(sample_id) AS first, MAX(sample_id) AS last FROM personas').get()!
    if (audit.verifiedRows !== options.expectedRows || count.count !== options.expectedRows || count.first !== 0 || count.last !== options.expectedRows - 1) throw new Error('Dataset count or continuous row index mismatch')
    if (audit.maxRowBytes >= 2000000) throw new Error('Row exceeds D1 size limit')
    audit.fieldsSha256 = digest.digest('hex')
    if (wasReady && old.fields_sha256 !== audit.fieldsSha256) throw new Error('Immutable dataset digest mismatch')
    db.prepare("UPDATE dataset_metadata SET status = 'ready', fields_sha256 = ? WHERE id = 1").run(audit.fieldsSha256)
    db.exec('COMMIT'); transaction = false
    db.exec('PRAGMA optimize')
    audit.queryPlan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM personas WHERE sample_id = ?').all(options.expectedRows - 1)
  } catch (error) {
    if (transaction) db.exec('ROLLBACK')
    await writeFile(path.join(options.output, 'preparation-failure.json'), JSON.stringify({ datasetVersion, verifiedRowsThisRun: audit.verifiedRows, error: String(error) }, null, 2) + '\n')
    throw error
  } finally { db.close() }
  audit.databaseBytes = (await stat(database)).size
  await writeFile(path.join(options.output, 'audit.json'), JSON.stringify(audit, null, 2) + '\n')
  return { database, audit }
}
