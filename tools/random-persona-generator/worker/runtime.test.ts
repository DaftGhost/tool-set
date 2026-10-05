import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { apiPath, canonicalFields, parseFields } from '../src/dataContract.ts'
import { fields } from '../test/fixtures.ts'
import { prepareDatabase, exportSql } from '../scripts/datasetPackage.ts'
import { importSqlPackage } from '../scripts/localImport.ts'

async function* sourceRows() { yield fields; yield { ...fields, uuid: 'c'.repeat(32), age: 0 } }

describe('real Worker and D1 runtime', () => {
  it('imports and reads verified fields, rejects partial imports, resumes and runs without table writes', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'persona-worker-'))
    process.env.WRANGLER_LOG_PATH = path.join(directory, 'logs')
    process.env.MINIFLARE_REGISTRY_PATH = path.join(directory, 'registry')
    process.env.WRANGLER_REGISTRY_PATH = path.join(directory, 'registry')
    process.env.WRANGLER_SEND_METRICS = 'false'
    const { createTestHarness } = await import('wrangler')
    const harness = createTestHarness({ workers: [{ configPath: 'wrangler.local.json' }] })
    try {
      await harness.listen()
      const worker = harness.getWorker<Pick<Env, 'PERSONAS_DB'>>()
      expect((await worker.fetch(apiPath)).status).toBe(503)
      const { PERSONAS_DB } = await worker.getEnv()
      const prepared = await prepareDatabase({ rows: sourceRows(), output: directory, expectedRows: 2, files: [{ name: 'fixture.parquet', bytes: 1, sha256: 'a'.repeat(64), rows: 2 }] })
      const exported = await exportSql(prepared.database, directory, 1700)
      const original = await import('node:fs/promises').then(fs => fs.readFile(path.join(directory, exported.readyFile), 'utf8'))
      await writeFile(path.join(directory, exported.readyFile), 'damaged')
      await expect(importSqlPackage(directory, PERSONAS_DB)).rejects.toThrow(/checksum/)
      expect((await worker.fetch(apiPath)).status).toBe(503)
      await writeFile(path.join(directory, exported.readyFile), original)
      expect((await importSqlPackage(directory, PERSONAS_DB)).verifiedRows).toBe(2)
      expect((await importSqlPackage(directory, PERSONAS_DB)).verifiedRows).toBe(2)
      const before = await PERSONAS_DB.prepare('SELECT * FROM personas ORDER BY sample_id').all()
      await PERSONAS_DB.exec("CREATE TRIGGER forbid_persona_update BEFORE UPDATE ON personas BEGIN SELECT RAISE(ABORT, 'read only'); END;\nCREATE TRIGGER forbid_metadata_update BEFORE UPDATE ON dataset_metadata BEGIN SELECT RAISE(ABORT, 'read only'); END;")
      const response = await worker.fetch(apiPath)
      expect(response.status).toBe(200)
      const result = await response.json() as { fields: unknown; schemaVersion: number }
      expect(result.schemaVersion).toBe(2)
      expect(canonicalFields(parseFields(result.fields))).toContain(fields.professional_persona.replaceAll('\n', '\\n'))
      expect((await worker.fetch(apiPath, { method: 'POST' })).status).toBe(405)
      expect((await worker.fetch(apiPath + '/translate', { method: 'POST' })).status).toBe(404)
      const after = await PERSONAS_DB.prepare('SELECT * FROM personas ORDER BY sample_id').all()
      expect(after.results).toEqual(before.results)
      const query = await PERSONAS_DB.prepare('SELECT * FROM personas WHERE sample_id = ?').bind(1).all()
      expect(query.meta.rows_read).toBe(1)
      expect(query.meta.rows_written).toBe(0)
    } finally {
      await harness.close()
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }, 30000)
})
