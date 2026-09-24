import { validateScenarioList } from '../domain/scenarios'
import type { ScenarioDraft } from '../domain/cost'

const STORAGE_KEY = 'tool-set:llm-api-cost-calculator:v1'

export type StoredScenarioState = Readonly<{
  scenarios: ScenarioDraft[]
  activeId: string
}>

export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; state: StoredScenarioState }
  | { status: 'invalid' }
  | { status: 'unavailable' }

export function loadScenarioState(): LoadResult {
  let serialized: string | null
  try {
    serialized = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return { status: 'unavailable' }
  }
  if (serialized === null) return { status: 'empty' }

  try {
    const value: unknown = JSON.parse(serialized)
    if (typeof value !== 'object' || value === null) return { status: 'invalid' }
    const record = value as Record<string, unknown>
    if (record.version !== 1 || !validateScenarioList(record.scenarios)) return { status: 'invalid' }

    const scenarios = record.scenarios
    const activeId = typeof record.activeId === 'string' && scenarios.some(({ id }) => id === record.activeId)
      ? record.activeId
      : scenarios[0].id

    return { status: 'loaded', state: { scenarios, activeId } }
  } catch {
    return { status: 'invalid' }
  }
}

export function saveScenarioState(state: StoredScenarioState): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...state }))
    return true
  } catch {
    return false
  }
}
