import type { ModelCatalogEntry } from '../services/modelCatalog'

const STORAGE_KEY = 'tool-set:llm-api-cost-calculator:model-catalog:v1'
const MAX_CACHED_MODELS = 20_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isModelCatalogEntry(value: unknown): value is ModelCatalogEntry {
  if (!isRecord(value) || typeof value.isFirstParty !== 'boolean' || !isRecord(value.source)) return false

  const source = value.source
  return isName(source.providerId)
    && isName(source.providerName)
    && isName(source.modelId)
    && isName(source.modelName)
    && isPrice(source.inputUsdPerMillion)
    && isPrice(source.cacheReadUsdPerMillion)
    && isPrice(source.outputUsdPerMillion)
    && (source.lastUpdated === null || (typeof source.lastUpdated === 'string' && source.lastUpdated.length <= 32))
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
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.models)) return null
    if (value.models.length === 0 || value.models.length > MAX_CACHED_MODELS) return null
    return value.models.every(isModelCatalogEntry) ? value.models : null
  } catch {
    return null
  }
}

export function saveModelCatalog(models: readonly ModelCatalogEntry[]): boolean {
  if (models.length === 0 || models.length > MAX_CACHED_MODELS) return false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, models }))
    return true
  } catch {
    return false
  }
}
