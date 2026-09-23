export type ScenarioDraft = {
  id: string
  name: string
  inputTokensM: string
  cacheHitPercent: string
  outputRatioPercent: string
  cachedPrice: string
  uncachedPrice: string
  outputPrice: string
}

export type CalculationInput = Readonly<{
  inputTokens: number
  cacheHitRate: number
  outputInputRatio: number
  cachedPricePerMillion: number
  uncachedPricePerMillion: number
  outputPricePerMillion: number
}>

export type CostBreakdown = Readonly<{
  inputTokens: number
  cachedTokens: number
  uncachedTokens: number
  outputTokens: number
  cachedCost: number
  uncachedCost: number
  inputCost: number
  outputCost: number
  totalCost: number
}>

export type DraftField = Exclude<keyof ScenarioDraft, 'id' | 'name'>
export type DraftErrors = Partial<Record<DraftField, string>>

type ParsedDraft = { ok: true; value: CalculationInput } | { ok: false; errors: DraftErrors }

function readNonNegativeNumber(value: string): number | null {
  const normalized = value.trim()
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null

  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

/** Converts editable UI strings into the unit-safe input accepted by calculateCost. */
export function parseScenarioDraft(draft: ScenarioDraft): ParsedDraft {
  const fields: DraftField[] = [
    'inputTokensM',
    'cacheHitPercent',
    'outputRatioPercent',
    'cachedPrice',
    'uncachedPrice',
    'outputPrice',
  ]
  const parsed = Object.fromEntries(fields.map((field) => [field, readNonNegativeNumber(draft[field])])) as Record<
    DraftField,
    number | null
  >
  const errors: DraftErrors = {}

  for (const field of fields) {
    if (parsed[field] === null) errors[field] = '请输入非负数字'
  }
  if (parsed.cacheHitPercent !== null && parsed.cacheHitPercent > 100) {
    errors.cacheHitPercent = '缓存命中率不能超过 100%'
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const inputTokens = parsed.inputTokensM! * 1_000_000
  const cacheHitRate = parsed.cacheHitPercent! / 100
  const outputInputRatio = parsed.outputRatioPercent! / 100
  const inputMillions = parsed.inputTokensM!
  const outputTokens = inputTokens * outputInputRatio
  const outputMillions = outputTokens / 1_000_000
  const potentialCosts = [
    inputMillions * parsed.cachedPrice!,
    inputMillions * parsed.uncachedPrice!,
    outputMillions * parsed.outputPrice!,
    inputMillions * Math.max(parsed.cachedPrice!, parsed.uncachedPrice!) + outputMillions * parsed.outputPrice!,
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
      outputInputRatio,
      cachedPricePerMillion: parsed.cachedPrice!,
      uncachedPricePerMillion: parsed.uncachedPrice!,
      outputPricePerMillion: parsed.outputPrice!,
    },
  }
}

/** Requires a CalculationInput returned by parseScenarioDraft. */
export function calculateCost(input: CalculationInput): CostBreakdown {
  const cachedTokens = input.inputTokens * input.cacheHitRate
  const uncachedTokens = input.inputTokens - cachedTokens
  const outputTokens = input.inputTokens * input.outputInputRatio
  const cachedCost = (cachedTokens / 1_000_000) * input.cachedPricePerMillion
  const uncachedCost = (uncachedTokens / 1_000_000) * input.uncachedPricePerMillion
  const outputCost = (outputTokens / 1_000_000) * input.outputPricePerMillion
  const inputCost = cachedCost + uncachedCost

  return {
    inputTokens: input.inputTokens,
    cachedTokens,
    uncachedTokens,
    outputTokens,
    cachedCost,
    uncachedCost,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  }
}

export function formatNumber(value: number, maximumFractionDigits = 3): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits }).format(value)
}
