import { ModelPrice } from '../domain/modelPrice'
import type { ModelCatalogEntry } from '../services/modelCatalog'

const STORAGE_KEY = 'tool-set:llm-api-cost-calculator:model-catalog:v2'
const MAX_CACHED_MODELS = 20_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isModelCatalogEntry(value: unknown): value is ModelCatalogEntry {
  return isRecord(value) && typeof value.isFirstParty === 'boolean' && ModelPrice.isSource(value.source)
}

export function loadModelCatalog(): ModelCatalogEntry[] | null {
  let serialized: string | null
  try {
    serialized = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (serialized === null) return null

  try {
    const value: unknown = JSON.parse(serialized)
    if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.models)) return null
    if (value.models.length === 0 || value.models.length > MAX_CACHED_MODELS) return null
    if (!value.models.every(isModelCatalogEntry)) return null
    return value.models.map((model) => ({ ...model, source: ModelPrice.normalize(model.source) }))
  } catch {
    return null
  }
}

export function saveModelCatalog(models: readonly ModelCatalogEntry[]): boolean {
  if (models.length === 0 || models.length > MAX_CACHED_MODELS) return false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, models }))
    return true
  } catch {
    return false
  }
}
