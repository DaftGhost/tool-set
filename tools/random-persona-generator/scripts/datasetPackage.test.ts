import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareDatabase, exportSql } from './datasetPackage.ts'
import { fields } from '../test/fixtures.ts'
import { datasetVersion, parseFields } from '../src/dataContract.ts'

const directories: string[] = []
async function directory() { const dir = await mkdtemp(path.join(tmpdir(), 'persona-d1-')); directories.push(dir); return dir }
afterEach(async () => { await Promise.all(directories.map(dir => rm(dir, { recursive: true, force: true }))); directories.length = 0 })
async function* rows(values: unknown[]) { for (const value of values) yield value }
const inventory = [{ name: 'test.parquet', sha256: 'a'.repeat(64), bytes: 100, rows: 2 }]

describe('D1 data preparation', () => {
  it('preserves every source field and normalized array through SQLite and exported SQL', async () => {
    const dir = await directory()
    const second = { ...fields, uuid: 'c'.repeat(32), age: 0, persona: "  O'Brien\nline\r\n", zipcode: '00001' }
    const prepared = await prepareDatabase({ rows: rows([fields, second]), output: dir, files: inventory, expectedRows: 2 })
    const db = new DatabaseSync(prepared.database, { readOnly: true })
    expect(parseFields(db.prepare('SELECT * FROM personas WHERE sample_id = 1').get())).toEqual(second)
    expect(db.prepare('SELECT status, row_count FROM dataset_metadata').get()).toMatchObject({ status: 'ready', row_count: 2 })
    expect(prepared.audit.emptyFields.bachelors_field).toBe(2)
    expect(prepared.audit.ageNeedsReview).toBe(1)
    expect(prepared.audit.verifiedRows).toBe(2)
    db.close()
    const exported = await exportSql(prepared.database, dir)
    const restored = new DatabaseSync(':memory:')
    for (const batch of exported.batches) restored.exec(await readFile(path.join(dir, batch.file), 'utf8'))
    restored.exec(await readFile(path.join(dir, exported.readyFile), 'utf8'))
    expect(parseFields(restored.prepare('SELECT * FROM personas WHERE sample_id = 1').get())).toEqual(second)
    expect(restored.prepare('SELECT dataset_version, status FROM dataset_metadata').get()).toMatchObject({ dataset_version: datasetVersion, status: 'ready' })
    restored.close()
  })
  it('resumes interrupted preparation and verifies existing records instead of overwriting a mismatch', async () => {
    const dir = await directory()
    async function* interrupted() { yield fields; throw new Error('interrupted source') }
    await expect(prepareDatabase({ rows: interrupted(), output: dir, files: inventory, expectedRows: 2, batchRows: 1 })).rejects.toThrow('interrupted source')
    const second = { ...fields, uuid: 'c'.repeat(32) }
    const result = await prepareDatabase({ rows: rows([fields, second]), output: dir, files: inventory, expectedRows: 2 })
    expect(result.audit.verifiedRows).toBe(2)
    await expect(prepareDatabase({ rows: rows([{ ...fields, persona: 'changed' }, second]), output: dir, files: inventory, expectedRows: 2 })).rejects.toThrow(/mismatch/)
  })
  it('leaves data unready and identifies the row for invalid lists, duplicate UUIDs and incomplete imports', async () => {
    for (const values of [[fields], [fields, fields], [fields, { ...fields, skills_and_expertise_list: '[1]' }]]) {
      const dir = await directory()
      await expect(prepareDatabase({ rows: rows(values), output: dir, files: inventory, expectedRows: 2 })).rejects.toThrow()
      const db = new DatabaseSync(path.join(dir, 'personas.sqlite'))
      expect(db.prepare('SELECT status FROM dataset_metadata').get()?.status).toBe('preparing')
      db.close()
    }
  })
})
