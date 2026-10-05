import { describe, expect, it, vi } from 'vitest'
import { fetchPersona } from './personaClient.ts'
import { apiPath } from './dataContract.ts'
import { snapshot } from '../test/fixtures.ts'

describe('persona client', () => {
  it('requests the same-origin API without caching and preserves every source field', async () => {
    const request = vi.fn(async () => Response.json(snapshot))
    expect(await fetchPersona(request)).toEqual(snapshot)
    expect(request).toHaveBeenCalledWith(apiPath, { cache: 'no-store' })
  })
  it('rejects missing fields, invalid arrays, identity mismatches and untrusted provenance', async () => {
    const { city: _, ...incomplete } = snapshot.fields
    const invalid = [
      { ...snapshot, fields: incomplete },
      { ...snapshot, fields: { ...snapshot.fields, age: '40' } },
      { ...snapshot, lists: { ...snapshot.lists, skills: [null] } },
      { ...snapshot, recordId: 'another-person' },
      { ...snapshot, source: { ...snapshot.source, url: 'javascript:alert(1)' } },
      { ...snapshot, sourceHash: '' }, { ...snapshot, schemaVersion: 1 },
    ]
    for (const value of invalid) await expect(fetchPersona(async () => Response.json(value))).rejects.toThrow(/无法读取/)
    await expect(fetchPersona(async () => new Response('', { status: 503 }))).rejects.toThrow(/暂不可用/)
  })
})
