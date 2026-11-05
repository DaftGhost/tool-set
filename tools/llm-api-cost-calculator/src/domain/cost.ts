export type ContextTierPrice = Readonly<{
  aboveTokens: number
  inputUsdPerMillion: number
  cacheReadUsdPerMillion: number
  cacheWriteUsdPerMillion: number
  outputUsdPerMillion: number
}>

export type ModelPriceSource = Readonly<{
  providerId: string
  providerName: string
  modelId: string
  modelName: string
  inputUsdPerMillion: number
  cacheReadUsdPerMillion: number
  cacheWriteUsdPerMillion: number
  outputUsdPerMillion: number
  contextTiers: readonly ContextTierPrice[]
  lastUpdated: string | null
}>

export type CustomTtlRow = Readonly<{
  id: string
  label: string
  writePrice: string
}>

export type ScenarioDraft = {
  id: string
  name: string
  inputTokensM: string
  cacheHitPercent: string
  cacheWritePercent: string
  outputRatioPercent: string
  cachedPrice: string
  cacheWritePrice: string
  uncachedPrice: string
  outputPrice: string
  contextTier: string
  cacheTtlId: string
  customTtls: CustomTtlRow[]
  modelPriceSource?: ModelPriceSource
}

export type CalculationInput = Readonly<{
  inputTokens: number
  cacheHitRate: number
  cacheWriteRate: number
  outputInputRatio: number
  cachedPricePerMillion: number
  cacheWritePricePerMillion: number
  uncachedPricePerMillion: number
  outputPricePerMillion: number
}>

export type CostBreakdown = Readonly<{
  inputTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  uncachedTokens: number
  outputTokens: number
  cachedCost: number
  cacheWriteCost: number
  uncachedCost: number
  inputCost: number
  outputCost: number
  totalCost: number
}>

export type DraftField =
  | 'inputTokensM'
  | 'cacheHitPercent'
  | 'cacheWritePercent'
  | 'outputRatioPercent'
  | 'cachedPrice'
  | 'cacheWritePrice'
  | 'uncachedPrice'
  | 'outputPrice'
export type DraftErrors = Partial<Record<DraftField, string>>

type ParsedDraft = { ok: true; value: CalculationInput } | { ok: false; errors: DraftErrors }

const numericFields: DraftField[] = [
  'inputTokensM',
  'cacheHitPercent',
  'cacheWritePercent',
  'outputRatioPercent',
  'cachedPrice',
  'cacheWritePrice',
  'uncachedPrice',
  'outputPrice',
]

const SHARE_OVERFLOW = '缓存命中与缓存写入合计不能超过 100%'

/** Turns editable strings into the single-request input accepted by calculateCost. */
export class RequestPricing {
  static readNonNegative(value: string): number | null {
    const normalized = value.trim()
    if (normalized === '') return 0
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null

    const number = Number(normalized)
    return Number.isFinite(number) ? number : null
  }

  static parse(draft: ScenarioDraft): ParsedDraft {
    const parsed = Object.fromEntries(numericFields.map((field) => [field, RequestPricing.readNonNegative(draft[field])])) as Record<
      DraftField,
      number | null
    >
    const errors: DraftErrors = {}

    for (const field of numericFields) {
      if (parsed[field] === null) errors[field] = '请输入非负数字'
    }
    if (parsed.cacheHitPercent !== null && parsed.cacheHitPercent > 100) {
      errors.cacheHitPercent = '缓存命中率不能超过 100%'
    }
    if (parsed.cacheWritePercent !== null && parsed.cacheWritePercent > 100) {
      errors.cacheWritePercent = '缓存写入占比不能超过 100%'
    }
    if (
      parsed.cacheHitPercent !== null
      && parsed.cacheWritePercent !== null
      && parsed.cacheHitPercent <= 100
      && parsed.cacheWritePercent <= 100
      && parsed.cacheHitPercent + parsed.cacheWritePercent > 100 + 1e-6
    ) {
      errors.cacheHitPercent = SHARE_OVERFLOW
      errors.cacheWritePercent = SHARE_OVERFLOW
    }
    if (Object.keys(errors).length > 0) return { ok: false, errors }

    const inputTokens = parsed.inputTokensM! * 1_000_000
    const cacheHitRate = parsed.cacheHitPercent! / 100
    const cacheWriteRate = parsed.cacheWritePercent! / 100
    const outputInputRatio = parsed.outputRatioPercent! / 100
    const inputMillions = parsed.inputTokensM!
    const outputTokens = inputTokens * outputInputRatio
    const outputMillions = outputTokens / 1_000_000
    const potentialCosts = [
      inputMillions * parsed.cachedPrice!,
      inputMillions * parsed.cacheWritePrice!,
      inputMillions * parsed.uncachedPrice!,
      outputMillions * parsed.outputPrice!,
      inputMillions * Math.max(parsed.cachedPrice!, parsed.cacheWritePrice!, parsed.uncachedPrice!)
        + outputMillions * parsed.outputPrice!,
    ]

    if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens) || !potentialCosts.every(Number.isFinite)) {
      return {
        ok: false,
        errors: { inputTokensM: '数值超出可计算范围，请调小输入或价格' },
      }
    }

    return {
      ok: true,
      value: {
        inputTokens,
        cacheHitRate,
        cacheWriteRate,
        outputInputRatio,
        cachedPricePerMillion: parsed.cachedPrice!,
        cacheWritePricePerMillion: parsed.cacheWritePrice!,
        uncachedPricePerMillion: parsed.uncachedPrice!,
        outputPricePerMillion: parsed.outputPrice!,
      },
    }
  }

  /** hit + write + uncached = one request. Write is its own price, never uncached plus a surcharge. */
  static calculate(input: CalculationInput): CostBreakdown {
    const cachedTokens = input.inputTokens * input.cacheHitRate
    const cacheWriteTokens = input.inputTokens * input.cacheWriteRate
    const uncachedTokens = input.inputTokens - cachedTokens - cacheWriteTokens
    const outputTokens = input.inputTokens * input.outputInputRatio
    const cachedCost = (cachedTokens / 1_000_000) * input.cachedPricePerMillion
    const cacheWriteCost = (cacheWriteTokens / 1_000_000) * input.cacheWritePricePerMillion
    const uncachedCost = (uncachedTokens / 1_000_000) * input.uncachedPricePerMillion
    const outputCost = (outputTokens / 1_000_000) * input.outputPricePerMillion
    const inputCost = cachedCost + cacheWriteCost + uncachedCost

    return {
      inputTokens: input.inputTokens,
      cachedTokens,
      cacheWriteTokens,
      uncachedTokens,
      outputTokens,
      cachedCost,
      cacheWriteCost,
      uncachedCost,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
    }
  }
}

/** Converts editable UI strings into the unit-safe input accepted by calculateCost. */
export function parseScenarioDraft(draft: ScenarioDraft): ParsedDraft {
  return RequestPricing.parse(draft)
}

/** Requires a CalculationInput returned by parseScenarioDraft. */
export function calculateCost(input: CalculationInput): CostBreakdown {
  return RequestPricing.calculate(input)
}

export function formatNumber(value: number, maximumFractionDigits = 3): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits }).format(value)
}
