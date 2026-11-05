import { describe, expect, it } from 'vitest'
import { buildChartModel } from '../domain/chart'
import { RequestPricing, calculateCost, parseScenarioDraft } from '../domain/cost'
import type { CalculationInput, ModelPriceSource, ScenarioDraft } from '../domain/cost'
import { CacheTtlPricing, ContextPricing } from '../domain/pricing'
import { normalizeScenarioDraft, validateScenarioList } from '../domain/scenarios'
import { CatalogCost } from '../services/modelCatalog'
import { loadModelCatalog } from '../storage/modelCatalogStorage'
import { loadScenarioState } from '../storage/scenarioStorage'
import { STORAGE_KEYS } from './fixtures'

function draft(overrides: Partial<ScenarioDraft> = {}): ScenarioDraft {
  return normalizeScenarioDraft({
    id: 'draft',
    name: '测算',
    inputTokensM: '1',
    cacheHitPercent: '50',
    cacheWritePercent: '20',
    outputRatioPercent: '10',
    cachedPrice: '1',
    cacheWritePrice: '4',
    uncachedPrice: '2',
    outputPrice: '3',
    contextTier: 'auto',
    cacheTtlId: 'catalog',
    customTtls: [],
    ...overrides,
  })
}

function source(overrides: Partial<ModelPriceSource> = {}): ModelPriceSource {
  return {
    providerId: 'openai',
    providerName: 'OpenAI',
    modelId: 'gpt-6.1-sol',
    modelName: 'GPT-6.1 Sol',
    inputUsdPerMillion: 2,
    cacheReadUsdPerMillion: 0.1,
    cacheWriteUsdPerMillion: 2.5,
    outputUsdPerMillion: 10,
    contextTiers: [
      {
        aboveTokens: 272_000,
        inputUsdPerMillion: 4,
        cacheReadUsdPerMillion: 0.2,
        cacheWriteUsdPerMillion: 5,
        outputUsdPerMillion: 15,
      },
    ],
    lastUpdated: null,
    ...overrides,
  }
}

function parsed(overrides: Partial<ScenarioDraft> = {}): CalculationInput {
  const result = parseScenarioDraft(draft(overrides))
  if (!result.ok) throw new Error('expected a valid draft')
  return result.value
}

describe('single-request cache pricing', () => {
  it('bills cache hit, cache write and uncached input as a disjoint split', () => {
    const cost = calculateCost(parsed())

    expect(cost.cachedTokens).toBe(500_000)
    expect(cost.cacheWriteTokens).toBe(200_000)
    expect(cost.uncachedTokens).toBe(300_000)
    expect(cost.cachedTokens + cost.cacheWriteTokens + cost.uncachedTokens).toBe(cost.inputTokens)
    expect(cost.cachedCost).toBeCloseTo(0.5)
    expect(cost.cacheWriteCost).toBeCloseTo(0.8)
    expect(cost.uncachedCost).toBeCloseTo(0.6)
    expect(cost.outputCost).toBeCloseTo(0.3)
    expect(cost.inputCost).toBeCloseTo(1.9)
    expect(cost.totalCost).toBeCloseTo(2.2)
  })

  it('rejects a hit share and write share that add up to more than 100', () => {
    const overflow = parseScenarioDraft(draft({ cacheHitPercent: '80', cacheWritePercent: '30' }))
    const exact = parseScenarioDraft(draft({ cacheHitPercent: '60', cacheWritePercent: '40' }))
    const hitOnly = parseScenarioDraft(draft({ cacheHitPercent: '101', cacheWritePercent: '0' }))

    expect(overflow.ok).toBe(false)
    if (!overflow.ok) {
      expect(overflow.errors.cacheHitPercent).toBe('缓存命中与缓存写入合计不能超过 100%')
      expect(overflow.errors.cacheWritePercent).toBe('缓存命中与缓存写入合计不能超过 100%')
    }
    expect(exact.ok).toBe(true)
    expect(hitOnly.ok).toBe(false)
    if (!hitOnly.ok) expect(hitOnly.errors.cacheHitPercent).toBe('缓存命中率不能超过 100%')
  })

  it('treats an empty numeric field as 0 and accepts a zero price', () => {
    const result = parseScenarioDraft(draft({
      inputTokensM: '',
      cacheHitPercent: '',
      cacheWritePercent: '',
      outputRatioPercent: '',
      cachedPrice: '0',
      cacheWritePrice: '',
      uncachedPrice: '0',
      outputPrice: '',
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.inputTokens).toBe(0)
    expect(result.value.cachedPricePerMillion).toBe(0)
    expect(result.value.cacheWritePricePerMillion).toBe(0)
    expect(result.value.uncachedPricePerMillion).toBe(0)
    expect(result.value.outputPricePerMillion).toBe(0)
    expect(calculateCost(result.value).totalCost).toBe(0)
    expect(RequestPricing.readNonNegative('')).toBe(0)
    expect(RequestPricing.readNonNegative('  ')).toBe(0)
  })

  it('keeps the base bracket at 272000 tokens and the next bracket at 272001', () => {
    const priced = source()

    expect(ContextPricing.aboveTokens(272_000, priced.contextTiers)).toBeNull()
    expect(ContextPricing.aboveTokens(272_001, priced.contextTiers)).toBe(272_000)
    expect(ContextPricing.bracket(priced, 'auto', ContextPricing.promptTokens('0.272')).inputUsdPerMillion).toBe(2)
    expect(ContextPricing.bracket(priced, 'auto', ContextPricing.promptTokens('0.272001')).inputUsdPerMillion).toBe(4)
    expect(ContextPricing.bracket(priced, 'base', 300_000).cacheWriteUsdPerMillion).toBe(2.5)
  })

  it('selects the highest context cliff that the prompt has passed', () => {
    const tiers = [
      {
        aboveTokens: 128_000,
        inputUsdPerMillion: 3,
        cacheReadUsdPerMillion: 0.3,
        cacheWriteUsdPerMillion: 4,
        outputUsdPerMillion: 9,
      },
      {
        aboveTokens: 32_000,
        inputUsdPerMillion: 2,
        cacheReadUsdPerMillion: 0.2,
        cacheWriteUsdPerMillion: 3,
        outputUsdPerMillion: 8,
      },
    ]
    const priced = source({ contextTiers: tiers })

    expect(ContextPricing.aboveTokens(32_000, tiers)).toBeNull()
    expect(ContextPricing.aboveTokens(32_001, tiers)).toBe(32_000)
    expect(ContextPricing.aboveTokens(128_000, tiers)).toBe(32_000)
    expect(ContextPricing.aboveTokens(128_001, tiers)).toBe(128_000)
    expect(ContextPricing.bracket(priced, 'auto', 128_001).inputUsdPerMillion).toBe(3)
  })

  it('uses only durations published on cache_write and ignores invented multipliers', () => {
    const scalar = CatalogCost.read({ input: 2, output: 10, cache_read: 0.1, cache_write: 2.5 })
    const mapped = CatalogCost.read({
      input: 2,
      output: 10,
      cache_write: { '1h': 4, '5m': 2.5, note: 'skip me' },
    })
    const oneDuration = CatalogCost.read({ input: 2, output: 10, cache_write: { '5m': 2.5 } })

    expect(scalar?.cacheTtls).toEqual([])
    expect(CacheTtlPricing.choices(scalar?.cacheTtls ?? [])).toEqual([])
    expect(mapped?.cacheWriteUsdPerMillion).toBe(2.5)
    expect(mapped?.cacheTtls).toEqual([
      { id: '5m', writeUsdPerMillion: 2.5 },
      { id: '1h', writeUsdPerMillion: 4 },
    ])
    expect(CacheTtlPricing.choices(mapped?.cacheTtls ?? []).map((choice) => choice.label)).toEqual(['5m', '1h'])
    expect(oneDuration?.cacheTtls).toEqual([])
    expect(oneDuration?.cacheWriteUsdPerMillion).toBe(2.5)

    const bracket = ContextPricing.bracket(source({
      cacheWriteUsdPerMillion: 2.5,
      cacheTtls: mapped?.cacheTtls,
    }), 'base', 1)
    expect(CacheTtlPricing.writeUsd(bracket, '1h')).toBe(4)
    expect(CacheTtlPricing.writeUsd(bracket, 'anthropic-1h')).toBe(2.5)
    expect(CacheTtlPricing.writeUsd(bracket, 'catalog')).toBe(2.5)
  })

  it('caps the linear hit-rate axis at 100 minus the write share', () => {
    const withWrite = parsed({ cacheWritePercent: '40', cacheHitPercent: '0', outputRatioPercent: '0' })
    const withoutWrite: CalculationInput = { ...withWrite, cacheWriteRate: 0 }
    const capped = buildChartModel(
      [
        { id: 'write', name: '写入', input: withWrite },
        { id: 'plain', name: '普通', input: withoutWrite },
      ],
      'cacheHitPercent',
      'total',
      1,
    )

    expect(capped.axisMaximum).toBe(60)
    expect(capped.lines[0].endCost).toBeCloseTo(2.2)
    expect(capped.lines[0].startCost).toBeCloseTo(2.8)
  })

  it('loads a version 1 scenario that has no write, tier or TTL fields', () => {
    const legacy = {
      id: 'legacy',
      name: '旧方案',
      inputTokensM: '100',
      cacheHitPercent: '97',
      outputRatioPercent: '1',
      cachedPrice: '0.115',
      uncachedPrice: '0.4',
      outputPrice: '1.4',
      modelPriceSource: {
        providerId: 'openai',
        providerName: 'OpenAI',
        modelId: 'gpt-4o',
        modelName: 'GPT-4o',
        inputUsdPerMillion: 2.5,
        cacheReadUsdPerMillion: 1.25,
        outputUsdPerMillion: 10,
        lastUpdated: '2025-05-01',
      },
    }
    window.localStorage.setItem(STORAGE_KEYS.scenarios, JSON.stringify({ version: 1, scenarios: [legacy], activeId: 'legacy' }))

    expect(validateScenarioList([legacy])).toBe(true)
    const loaded = loadScenarioState()
    expect(loaded.status).toBe('loaded')
    if (loaded.status !== 'loaded') return
    const scenario = loaded.state.scenarios[0]
    expect(scenario.cacheWritePercent).toBe('0')
    expect(scenario.cacheWritePrice).toBe('0')
    expect(scenario.contextTier).toBe('auto')
    expect(scenario.cacheTtlId).toBe('')
    expect(scenario.modelPriceSource?.cacheWriteUsdPerMillion).toBe(0)
    expect(scenario.modelPriceSource?.contextTiers).toEqual([])
    const result = parseScenarioDraft(scenario)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(calculateCost(result.value).totalCost).toBeCloseTo(13.755)
  })
})

describe('models.dev context tiers', () => {
  it('omits a tier whose prices are all zero or invalid and keeps a priced sibling', () => {
    const priced = CatalogCost.read({
      input: 2,
      output: 10,
      cache_read: 0.1,
      cache_write: 2.5,
      tiers: [
        { input: 0, output: 0, cache_read: 0, cache_write: 0, tier: { type: 'context', size: 32_000 } },
        { input: 'n/a', output: -1, cache_read: false, tier: { type: 'context', size: 64_000 } },
        { input: 4, output: 0, cache_read: 0, cache_write: 0, tier: { type: 'context', size: 272_000 } },
        { output: 9, tier: { type: 'output', size: 10_000 } },
      ],
    })

    expect(priced?.contextTiers.map((tier) => tier.aboveTokens)).toEqual([272_000])
    expect(priced?.contextTiers[0]).toMatchObject({
      inputUsdPerMillion: 4,
      cacheReadUsdPerMillion: 0,
      cacheWriteUsdPerMillion: 0,
      outputUsdPerMillion: 0,
    })
  })

  it('keeps an explicit zero write price and does not duplicate context_over_200k', () => {
    const nested = CatalogCost.read({
      input: 1,
      output: 2,
      cache_write: 0,
      tiers: [
        { input: 3, output: 4, cache_read: 0.3, cache_write: 0, tier: { type: 'context', size: 200_000 } },
      ],
      context_over_200k: { input: 9, output: 9, cache_read: 9, cache_write: 9 },
    })
    const legacyOnly = CatalogCost.read({
      input: 1,
      output: 2,
      context_over_200k: { input: 8, output: 9, cache_read: 0.8, cache_write: 1.6 },
    })

    const shiftedThreshold = CatalogCost.read({
      input: 2,
      output: 10,
      cache_read: 0.1,
      cache_write: 2.5,
      tiers: [
        { input: 4, output: 15, cache_read: 0.2, cache_write: 5, tier: { type: 'context', size: 272_000 } },
      ],
      context_over_200k: { input: 4, output: 15, cache_read: 0.2, cache_write: 5 },
    })

    expect(nested?.contextTiers).toHaveLength(1)
    expect(nested?.contextTiers[0].cacheWriteUsdPerMillion).toBe(0)
    expect(nested?.cacheWriteUsdPerMillion).toBe(0)
    expect(shiftedThreshold?.contextTiers.map((tier) => tier.aboveTokens)).toEqual([272_000])
    expect(legacyOnly?.contextTiers).toEqual([])
    expect(legacyOnly?.inputUsdPerMillion).toBe(1)
  })

  it('ignores a version 1 catalog cache', () => {
    window.localStorage.setItem(
      'tool-set:llm-api-cost-calculator:model-catalog:v1',
      JSON.stringify({ version: 1, models: [{ source: { modelId: 'old' }, isFirstParty: true }] }),
    )

    expect(loadModelCatalog()).toBeNull()
  })
})
