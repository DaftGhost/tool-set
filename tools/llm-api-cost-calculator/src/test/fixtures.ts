// Plain data shared by the characterization tests. Nothing here depends on the UI framework.

// Mirrors the keys used by src/storage/*.ts (they are not exported there).
export const STORAGE_KEYS = {
  scenarios: 'tool-set:llm-api-cost-calculator:v1',
  currency: 'tool-set:llm-api-cost-calculator:currency:v1',
  catalog: 'tool-set:llm-api-cost-calculator:model-catalog:v2',
} as const

// Mirrors the request URLs in src/services/*.ts.
export const RATE_URL = 'https://api.frankfurter.dev/v2/rate/usd/cny?providers=ecb'
export const CATALOG_URL = 'https://models.dev/catalog.json'

export const RATE_DATE = '2026-10-23'
export const cachedRate = { usdToCny: 7.2, date: RATE_DATE, fetchedAt: 1_790_000_000_000 }

export type DraftFixture = {
  id: string
  name: string
  inputTokensM: string
  cacheHitPercent: string
  outputRatioPercent: string
  cachedPrice: string
  uncachedPrice: string
  outputPrice: string
  cacheWritePercent?: string
  cacheWritePrice?: string
  contextTier?: string
  cacheTtlId?: string
  modelPriceSource?: Record<string, unknown>
}

export function draft(id: string, name: string, overrides: Partial<DraftFixture> = {}): DraftFixture {
  return {
    id,
    name,
    inputTokensM: '100',
    cacheHitPercent: '97',
    outputRatioPercent: '1',
    cachedPrice: '0.115',
    uncachedPrice: '0.4',
    outputPrice: '1.4',
    ...overrides,
  }
}

// Stored-scenario samples. Built-in examples, including the 94/5 cache split, live in domain/scenarios.ts.
export const exampleOne = (): DraftFixture => draft('example-1', '方案 1')
export const exampleTwo = (): DraftFixture => draft('example-2', '方案 2', {
  cachedPrice: '0.02',
  uncachedPrice: '2',
  outputPrice: '4',
})

export function storeScenarios(scenarios: DraftFixture[], activeId: string = scenarios[0].id): void {
  window.localStorage.setItem(STORAGE_KEYS.scenarios, JSON.stringify({ version: 1, scenarios, activeId }))
}

export function storeCurrency(currency: 'CNY' | 'USD', rate: typeof cachedRate | null = cachedRate): void {
  window.localStorage.setItem(STORAGE_KEYS.currency, JSON.stringify({ currency, rate }))
}

const catalogSource = (
  providerId: string,
  providerName: string,
  modelId: string,
  modelName: string,
  input: number,
  cacheRead: number,
  output: number,
  lastUpdated: string | null,
) => ({
  providerId,
  providerName,
  modelId,
  modelName,
  inputUsdPerMillion: input,
  cacheReadUsdPerMillion: cacheRead,
  cacheWriteUsdPerMillion: 0,
  outputUsdPerMillion: output,
  contextTiers: [],
  lastUpdated,
})

// Stored model catalog entries, in the order the catalog service sorts them.
export const cachedCatalogEntries = [
  { source: catalogSource('alibaba-cn', 'Alibaba Cloud', 'qwen-plus-latest', 'Qwen Plus', 0.4, 0.04, 1.2, '2025-04-28'), isFirstParty: true },
  { source: catalogSource('deepseek', 'DeepSeek', 'deepseek-chat', 'DeepSeek Chat', 0.27, 0.07, 1.1, null), isFirstParty: true },
  { source: catalogSource('openai', 'OpenAI', 'gpt-4o', 'GPT-4o', 2.5, 1.25, 10, '2025-05-01'), isFirstParty: true },
  { source: catalogSource('openai', 'OpenAI', 'o3-mini', 'o3-mini', 1.1, 0.55, 4.4, '2025-01-31'), isFirstParty: true },
  { source: catalogSource('openrouter', 'OpenRouter', 'openai/gpt-4o', 'GPT-4o', 2.5, 1.25, 10, null), isFirstParty: false },
  { source: catalogSource('long-lab', 'Very Long Provider Name Company Limited', 'long-model', 'Model', 1, 0.5, 2, null), isFirstParty: false },
]

export function storeCatalog(): void {
  window.localStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify({ version: 2, models: cachedCatalogEntries }))
}

export function storeAllCaches(scenarios: DraftFixture[] = [exampleOne(), exampleTwo()], currency: 'CNY' | 'USD' = 'CNY'): void {
  storeScenarios(scenarios)
  storeCurrency(currency)
  storeCatalog()
}

export function rawStored(key: keyof typeof STORAGE_KEYS): string | null {
  return window.localStorage.getItem(STORAGE_KEYS[key])
}

const rawModel = (name: string, input: number, output: number, cacheRead: number | undefined, lastUpdated: string | null) => ({
  name,
  cost: cacheRead === undefined ? { input, output } : { input, output, cache_read: cacheRead },
  modalities: { input: ['text'], output: ['text'] },
  last_updated: lastUpdated,
})

// Raw models.dev catalog.json shape, as read by services/modelCatalog.ts.
export function catalogPayload() {
  const bulk: Record<string, ReturnType<typeof rawModel>> = {}
  for (let number = 1; number <= 105; number += 1) {
    bulk[`bulk-model-${String(number).padStart(3, '0')}`] = rawModel(`Bulk Model ${number}`, 1, 2, undefined, null)
  }
  return {
    providers: {
      'alibaba-cn': { name: 'Alibaba Cloud', models: { 'qwen-plus-latest': rawModel('Qwen Plus', 0.4, 1.2, 0.04, '2025-04-28') } },
      deepseek: { name: 'DeepSeek', models: { 'deepseek-chat': rawModel('DeepSeek Chat', 0.27, 1.1, 0.07, null) } },
      openai: {
        name: 'OpenAI',
        models: {
          'gpt-4o': rawModel('GPT-4o', 2.5, 10, 1.25, '2025-05-01'),
          'o3-mini': rawModel('o3-mini', 1.1, 4.4, 0.55, '2025-01-31'),
        },
      },
      openrouter: { name: 'OpenRouter', models: { 'openai/gpt-4o': rawModel('GPT-4o', 2.5, 10, 1.25, null) } },
      'long-lab': { name: 'Very Long Provider Name Company Limited', models: { 'long-model': rawModel('Model', 1, 2, 0.5, null) } },
      bulk: { name: 'Bulk Lab', models: bulk },
    },
    models: {
      'alibaba/qwen-plus-latest': {},
      'deepseek/deepseek-chat': {},
      'openai/gpt-4o': {},
      'openai/o3-mini': {},
    },
  }
}
