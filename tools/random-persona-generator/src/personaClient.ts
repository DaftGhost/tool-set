import { apiPath, parseSnapshot } from './dataContract.ts'
import type { PersonaSnapshot } from './dataContract.ts'

export class PersonaReadError extends Error {}

export async function fetchPersona(request: typeof fetch = fetch): Promise<PersonaSnapshot> {
  const response = await request(apiPath, { cache: 'no-store' })
  if (response.status === 503) throw new PersonaReadError('人设数据暂不可用，请稍后重试。')
  if (!response.ok) throw new PersonaReadError('人设读取失败，请重试。')
  try {
    return parseSnapshot(await response.json())
  } catch {
    throw new PersonaReadError('人设内容无法读取，请重试。')
  }
}
