import type { ModelPriceSource, ScenarioDraft } from './cost'
import { ModelPrice } from './modelPrice'
import { ContextPricing } from './pricing'

export const MAX_SCENARIOS = 16

function blankCacheFields(): Pick<ScenarioDraft, 'cacheWritePercent' | 'cacheWritePrice' | 'contextTier' | 'cacheTtlId'> {
  return {
    cacheWritePercent: '5',
    cacheWritePrice: '0',
    contextTier: 'auto',
    cacheTtlId: '',
  }
}

export const exampleScenarios: ScenarioDraft[] = [
  {
    id: 'example-1',
    name: '方案 1',
    inputTokensM: '100',
    cacheHitPercent: '94',
    outputRatioPercent: '1',
    cachedPrice: '0.115',
    uncachedPrice: '0.4',
    outputPrice: '1.4',
    ...blankCacheFields(),
  },
  {
    id: 'example-2',
    name: '方案 2',
    inputTokensM: '100',
    cacheHitPercent: '94',
    outputRatioPercent: '1',
    cachedPrice: '0.02',
    uncachedPrice: '2',
    outputPrice: '4',
    ...blankCacheFields(),
  },
]

function nextScenarioName(scenarios: readonly ScenarioDraft[]): string {
  const used = new Set(scenarios.map(({ name }) => name))
  let number = 1
  while (used.has(`方案 ${number}`)) number += 1
  return `方案 ${number}`
}

export function cloneScenario(source: ScenarioDraft, scenarios: readonly ScenarioDraft[]): ScenarioDraft | null {
  if (scenarios.length >= MAX_SCENARIOS) return null

  const scenario = {
    ...source,
    id: `scenario-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: nextScenarioName(scenarios),
  }
  delete scenario.modelPriceSource
  // Archived custom TTL rows are not a scenario field. A spread of an old object must not keep them.
  delete (scenario as { customTtls?: unknown }).customTtls
  return scenario
}

function optionalString(record: Record<string, unknown>, field: string, maxLength: number): boolean {
  return record[field] === undefined || (typeof record[field] === 'string' && record[field].length <= maxLength)
}

export function isScenarioDraft(value: unknown): value is ScenarioDraft {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const stringFields = [
    'id',
    'name',
    'inputTokensM',
    'cacheHitPercent',
    'outputRatioPercent',
    'cachedPrice',
    'uncachedPrice',
    'outputPrice',
  ]

  return stringFields.every((field) => typeof record[field] === 'string' && record[field].length <= 64)
    && (record.id as string).trim().length > 0
    && optionalString(record, 'cacheWritePercent', 64)
    && optionalString(record, 'cacheWritePrice', 64)
    && optionalString(record, 'contextTier', 32)
    && optionalString(record, 'cacheTtlId', 40)
    && (record.modelPriceSource === undefined || ModelPrice.isSource(record.modelPriceSource))
}

export function normalizeModelPriceSource(source: ModelPriceSource): ModelPriceSource {
  return ModelPrice.normalize(source)
}

function displayZero(value: string | undefined): string {
  return typeof value === 'string' && value.trim() !== '' ? value : '0'
}

/** Fills fields added after the first save. A saved manual context tier is priced from the input token count. Archived customTtls are ignored. */
export function normalizeScenarioDraft(value: ScenarioDraft, usdToCny?: number): ScenarioDraft {
  const record = value as ScenarioDraft & Record<string, unknown>
  const storedTier = typeof record.contextTier === 'string' ? record.contextTier.trim() : ''
  const manualTier = storedTier !== '' && storedTier !== 'auto'
  const normalized: ScenarioDraft = {
    id: value.id,
    name: value.name,
    inputTokensM: displayZero(value.inputTokensM),
    cacheHitPercent: displayZero(value.cacheHitPercent),
    cacheWritePercent: displayZero(typeof record.cacheWritePercent === 'string' ? record.cacheWritePercent : undefined),
    outputRatioPercent: displayZero(value.outputRatioPercent),
    cachedPrice: displayZero(value.cachedPrice),
    cacheWritePrice: displayZero(typeof record.cacheWritePrice === 'string' ? record.cacheWritePrice : undefined),
    uncachedPrice: displayZero(value.uncachedPrice),
    outputPrice: displayZero(value.outputPrice),
    contextTier: 'auto',
    cacheTtlId: typeof record.cacheTtlId === 'string' ? record.cacheTtlId : '',
  }
  if (value.modelPriceSource) normalized.modelPriceSource = normalizeModelPriceSource(value.modelPriceSource)
  if (!manualTier || usdToCny === undefined || !normalized.modelPriceSource) return normalized
  return {
    ...normalized,
    ...ContextPricing.catalogPrices(
      normalized.modelPriceSource,
      ContextPricing.promptTokens(normalized.inputTokensM),
      normalized.cacheTtlId,
      usdToCny,
    ),
  }
}

export function validateScenarioList(value: unknown): value is ScenarioDraft[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SCENARIOS) return false
  if (!value.every(isScenarioDraft)) return false
  return new Set(value.map(({ id }) => id)).size === value.length
}
