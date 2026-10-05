import { describe, expect, it, vi } from 'vitest'
import { handlePersonaRequest, randomRow } from './personaApi.ts'
import { apiPath, datasetVersion, datasetName } from '../src/dataContract.ts'
import { fields, lists, snapshot } from '../test/fixtures.ts'

const metadata = { dataset_version: datasetVersion, dataset_name: datasetName, split: 'train', row_count: 35, status: 'ready' }
function environment(meta: unknown = metadata, row: unknown = { ...fields, sample_id: 34, source_hash: snapshot.sourceHash, skills_json: JSON.stringify(lists.skills), hobbies_json: JSON.stringify(lists.hobbies) }) {
  const queries: { sql: string; parameters: unknown[] }[] = []
  const database = { prepare(sql: string) {
    if (!sql.startsWith('SELECT ')) throw new Error('Runtime must be read-only')
    const query = { sql, parameters: [] as unknown[] }; queries.push(query)
    return { bind(...parameters: unknown[]) { query.parameters = parameters; return this }, async first() { return sql.includes('dataset_metadata') ? meta : row } }
  } }
  return { env: { database, datasetVersion }, queries }
}
const url = `https://tool.example${apiPath}`

describe('random persona D1 API', () => {
  it('queries metadata and one primary key, returns all source fields and never writes', async () => {
    const { env, queries } = environment()
    const response = await handlePersonaRequest(new Request(url), env, () => 34)
    expect(response?.status).toBe(200)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    expect(await response?.json()).toEqual(snapshot)
    expect(queries).toHaveLength(2)
    expect(queries[1].sql).toContain('WHERE sample_id = ?')
    expect(queries[1].parameters).toEqual([34])
  })
  it('does not serve partial or wrong-version databases, missing records or corrupted fields/lists', async () => {
    for (const meta of [null, { ...metadata, status: 'preparing' }, { ...metadata, dataset_version: '0'.repeat(40) }, { ...metadata, row_count: 0 }]) {
      const { env } = environment(meta)
      expect((await handlePersonaRequest(new Request(url), env))?.status).toBe(503)
    }
    for (const row of [{ ...fields, sample_id: 34, source_hash: 'b'.repeat(64), skills_json: JSON.stringify(lists.skills), hobbies_json: JSON.stringify(lists.hobbies) }, null, { ...fields, source_hash: 'invalid' }, { ...fields, skills_json: '[1]' }]) {
      const { env } = environment(metadata, row)
      expect((await handlePersonaRequest(new Request(url), env, () => 34))?.status).toBe(503)
    }
  })
  it('leaves assets alone and rejects removed translation routes or write methods without accessing D1', async () => {
    const { env, queries } = environment()
    expect(await handlePersonaRequest(new Request('https://tool.example/'), env)).toBeNull()
    expect((await handlePersonaRequest(new Request(url, { method: 'POST' }), env))?.status).toBe(405)
    expect((await handlePersonaRequest(new Request(url + '/translate', { method: 'POST' }), env))?.status).toBe(404)
    expect(queries).toEqual([])
  })
  it('rejects out-of-range random values before modulo so all one million rows have equal probability', () => {
    const values = [0xffffffff, 0, 999999]
    const draw = vi.fn(() => values.shift()!)
    expect(randomRow(1000000, draw)).toBe(0)
    expect(randomRow(1000000, draw)).toBe(999999)
    expect(draw).toHaveBeenCalledTimes(3)
    expect(() => randomRow(0, draw)).toThrow()
  })
})
