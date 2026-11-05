import type { CacheDurationPrice, ContextTierPrice, CustomTtlRow, ModelPriceSource, ScenarioDraft } from './cost'

export const MAX_SCENARIOS = 16
export const MAX_CUSTOM_TTLS = 8

function blankCacheFields(): Pick<ScenarioDraft, 'cacheWritePercent' | 'cacheWritePrice' | 'contextTier' | 'cacheTtlId' | 'customTtls'> {
  return {
    cacheWritePercent: '0',
    cacheWritePrice: '0',
    contextTier: 'auto',
    cacheTtlId: '',
    customTtls: [],
  }
}

export const exampleScenarios: ScenarioDraft[] = [
  {
    id: 'example-1',
    name: '方案 1',
    inputTokensM: '100',
    cacheHitPercent: '97',
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
    cacheHitPercent: '97',
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
    customTtls: source.customTtls.map((row) => ({ ...row })),
    id: `scenario-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: nextScenarioName(scenarios),
  }
  delete scenario.modelPriceSource
  return scenario
}

function isCacheDuration(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && record.id.length > 0
    && record.id.length <= 16
    && typeof record.writeUsdPerMillion === 'number'
    && Number.isFinite(record.writeUsdPerMillion)
    && record.writeUsdPerMillion >= 0
}

function isCacheDurationList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length <= 8 && value.every(isCacheDuration))
}

function isContextTierPrice(value: unknown): value is ContextTierPrice {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const prices = [record.inputUsdPerMillion, record.cacheReadUsdPerMillion, record.cacheWriteUsdPerMillion, record.outputUsdPerMillion]
  return typeof record.aboveTokens === 'number'
    && Number.isInteger(record.aboveTokens)
    && record.aboveTokens > 0
    && record.aboveTokens <= 100_000_000
    && prices.every((price) => typeof price === 'number' && Number.isFinite(price) && price >= 0)
    && isCacheDurationList(record.cacheTtls)
}

function isModelPriceSource(value: unknown): value is ModelPriceSource {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const identifiers = ['providerId', 'providerName', 'modelId', 'modelName']
  const hasValidIdentifiers = identifiers.every((field) =>
    typeof record[field] === 'string'
    && record[field].trim().length > 0
    && record[field].length <= 160,
  )
  const prices = [record.inputUsdPerMillion, record.cacheReadUsdPerMillion, record.outputUsdPerMillion]
  const hasValidPrices = prices.every((price) =>
    typeof price === 'number'
    && Number.isFinite(price)
    && price >= 0,
  )
  const hasValidWrite = record.cacheWriteUsdPerMillion === undefined
    || (typeof record.cacheWriteUsdPerMillion === 'number'
      && Number.isFinite(record.cacheWriteUsdPerMillion)
      && record.cacheWriteUsdPerMillion >= 0)
  const hasValidTiers = record.contextTiers === undefined
    || (Array.isArray(record.contextTiers) && record.contextTiers.length <= 32 && record.contextTiers.every(isContextTierPrice))
  const hasValidTtls = isCacheDurationList(record.cacheTtls)
  const hasValidLastUpdated = record.lastUpdated === null
    || (typeof record.lastUpdated === 'string' && record.lastUpdated.length <= 32)

  return hasValidIdentifiers && hasValidPrices && hasValidWrite && hasValidTiers && hasValidTtls && hasValidLastUpdated
}

function isCustomTtlRow(value: unknown): value is CustomTtlRow {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && record.id.trim().length > 0
    && record.id.length <= 40
    && typeof record.label === 'string'
    && record.label.length <= 32
    && typeof record.writePrice === 'string'
    && record.writePrice.length <= 64
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
    && (record.customTtls === undefined
      || (Array.isArray(record.customTtls) && record.customTtls.length <= MAX_CUSTOM_TTLS && record.customTtls.every(isCustomTtlRow)))
    && (record.modelPriceSource === undefined || isModelPriceSource(record.modelPriceSource))
}

function copyDurations(value: unknown): CacheDurationPrice[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((item) => {
    const record = item as CacheDurationPrice
    return { id: record.id, writeUsdPerMillion: record.writeUsdPerMillion }
  })
}

export function normalizeModelPriceSource(source: ModelPriceSource): ModelPriceSource {
  const record = source as ModelPriceSource & { cacheWriteUsdPerMillion?: number; contextTiers?: readonly ContextTierPrice[] }
  const cacheTtls = copyDurations(record.cacheTtls)
  return {
    providerId: source.providerId,
    providerName: source.providerName,
    modelId: source.modelId,
    modelName: source.modelName,
    inputUsdPerMillion: source.inputUsdPerMillion,
    cacheReadUsdPerMillion: source.cacheReadUsdPerMillion,
    cacheWriteUsdPerMillion: typeof record.cacheWriteUsdPerMillion === 'number' ? record.cacheWriteUsdPerMillion : 0,
    ...(cacheTtls ? { cacheTtls } : {}),
    outputUsdPerMillion: source.outputUsdPerMillion,
    contextTiers: Array.isArray(record.contextTiers)
      ? record.contextTiers.map((tier) => {
          const tierTtls = copyDurations(tier.cacheTtls)
          return tierTtls ? { ...tier, cacheTtls: tierTtls } : { ...tier }
        })
      : [],
    lastUpdated: source.lastUpdated,
  }
}

function displayZero(value: string | undefined): string {
  return typeof value === 'string' && value.trim() !== '' ? value : '0'
}

/** Fills fields added after the first save so older drafts keep their costs and show 0 for the new inputs. */
export function normalizeScenarioDraft(value: ScenarioDraft): ScenarioDraft {
  const record = value as ScenarioDraft & Record<string, unknown>
  const customTtls = Array.isArray(record.customTtls)
    ? record.customTtls.map((row) => ({ ...row }))
    : []
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
    contextTier: typeof record.contextTier === 'string' && record.contextTier.trim() !== '' ? record.contextTier : 'auto',
    cacheTtlId: typeof record.cacheTtlId === 'string' ? record.cacheTtlId : '',
    customTtls,
  }
  if (value.modelPriceSource) normalized.modelPriceSource = normalizeModelPriceSource(value.modelPriceSource)
  return normalized
}

export function validateScenarioList(value: unknown): value is ScenarioDraft[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SCENARIOS) return false
  if (!value.every(isScenarioDraft)) return false
  return new Set(value.map(({ id }) => id)).size === value.length
}
