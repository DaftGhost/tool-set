import type { ModelPriceSource, ScenarioDraft } from './cost'

export const MAX_SCENARIOS = 16

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
  return scenario
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
  const hasValidLastUpdated = record.lastUpdated === null
    || (typeof record.lastUpdated === 'string' && record.lastUpdated.length <= 32)

  return hasValidIdentifiers && hasValidPrices && hasValidLastUpdated
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
    && (record.modelPriceSource === undefined || isModelPriceSource(record.modelPriceSource))
}

export function validateScenarioList(value: unknown): value is ScenarioDraft[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SCENARIOS) return false
  if (!value.every(isScenarioDraft)) return false
  return new Set(value.map(({ id }) => id)).size === value.length
}
