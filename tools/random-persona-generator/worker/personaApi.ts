import { apiPath, canonicalFields, datasetName, datasetVersion, objectValue, parseSnapshot, source } from '../src/dataContract.ts'

// The request handler depends only on read methods, not on D1's write-capable API.
export interface PersonaStatement {
  bind(...values: unknown[]): PersonaStatement
  first(): Promise<unknown>
}
export interface PersonaDatabase { prepare(query: string): PersonaStatement }
export interface PersonaStorage { database?: PersonaDatabase; datasetVersion: string }

function drawUint32() { return crypto.getRandomValues(new Uint32Array(1))[0] }
export function randomRow(count: number, draw: () => number = drawUint32): number {
  if (!Number.isSafeInteger(count) || count < 1 || count > 0xffffffff) throw new Error('Invalid row count')
  const ceiling = Math.floor(0x100000000 / count) * count
  let value = draw()
  while (value >= ceiling) value = draw()
  return value % count
}

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', ...headers } })
}

export async function handlePersonaRequest(request: Request, storage: PersonaStorage, chooseRow = randomRow): Promise<Response | null> {
  const pathname = new URL(request.url).pathname
  if (!pathname.startsWith('/tools/random-persona-generator/api/')) return null
  if (pathname !== apiPath) return jsonResponse({ error: 'NOT_FOUND' }, 404)
  if (request.method !== 'GET') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'GET' })
  try {
    if (!storage.database) throw new Error('Persona database is not configured')
    const metadata = objectValue(await storage.database.prepare('SELECT dataset_version, dataset_name, split, row_count, status FROM dataset_metadata WHERE id = 1').first())
    if (storage.datasetVersion !== datasetVersion || metadata.dataset_version !== datasetVersion || metadata.dataset_name !== datasetName
      || metadata.split !== 'train' || metadata.status !== 'ready' || !Number.isSafeInteger(metadata.row_count)) throw new Error('Dataset is not ready')
    const rowCount = metadata.row_count as number
    const row = chooseRow(rowCount)
    if (!Number.isSafeInteger(row) || row < 0 || row >= rowCount) throw new Error('Invalid random row')
    const stored = objectValue(await storage.database.prepare('SELECT * FROM personas WHERE sample_id = ?').bind(row).first())
    if (stored.sample_id !== row) throw new Error('Record index mismatch')
    const result = parseSnapshot({
      schemaVersion: 2, recordId: stored.uuid, datasetVersion, sourceHash: stored.source_hash, source,
      fields: stored, lists: { skills: JSON.parse(String(stored.skills_json)), hobbies: JSON.parse(String(stored.hobbies_json)) },
    })
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalFields(result.fields)))
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    if (hash !== result.sourceHash) throw new Error('Stored source digest mismatch')
    return jsonResponse(result)
  } catch (error) {
    console.error(JSON.stringify({ event: 'persona_read_failed', reason: error instanceof Error ? error.message : 'Unknown error' }))
    return jsonResponse({ error: 'PERSONA_DATA_UNAVAILABLE' }, 503)
  }
}
