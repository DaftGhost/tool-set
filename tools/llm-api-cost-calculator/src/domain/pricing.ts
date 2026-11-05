import type { ContextTierPrice, CustomTtlRow, ModelPriceSource } from './cost'
import { formatNumber } from './cost'

export type PriceBracket = Readonly<{
  aboveTokens: number | null
  inputUsdPerMillion: number
  cacheReadUsdPerMillion: number
  cacheWriteUsdPerMillion: number
  outputUsdPerMillion: number
}>

export type CacheTtlChoice = Readonly<{
  id: string
  label: string
  custom: boolean
}>

const CATALOG_TTL: CacheTtlChoice = { id: 'catalog', label: '目录默认', custom: false }
const ANTHROPIC_HOUR: CacheTtlChoice = { id: 'anthropic-1h', label: '1 小时（2× 本档输入价）', custom: false }
const OPENAI_12H: CacheTtlChoice = { id: 'openai-12h', label: '12 小时（2.5× 本档输入价）', custom: false }

/** Whole-request context cliffs. A tier applies only when prompt tokens are greater than its size. */
export class ContextPricing {
  static promptTokens(inputTokensM: string): number {
    const normalized = inputTokensM.trim()
    if (normalized === '') return 0
    const value = Number(normalized)
    if (!Number.isFinite(value) || value < 0) return 0
    return Math.round(value * 1_000_000)
  }

  static ordered(tiers: readonly ContextTierPrice[]): ContextTierPrice[] {
    return [...tiers].sort((left, right) => left.aboveTokens - right.aboveTokens)
  }

  /** Highest tier whose size is strictly below the prompt, or null for the base bracket. */
  static aboveTokens(promptTokens: number, tiers: readonly ContextTierPrice[]): number | null {
    let matched: number | null = null
    for (const tier of ContextPricing.ordered(tiers)) {
      if (promptTokens > tier.aboveTokens) matched = tier.aboveTokens
    }
    return matched
  }

  static bracket(source: ModelPriceSource, contextTier: string, promptTokens: number): PriceBracket {
    const selected = contextTier === 'auto'
      ? ContextPricing.aboveTokens(promptTokens, source.contextTiers)
      : ContextPricing.pinnedTier(contextTier, source.contextTiers)
    if (selected === null) return ContextPricing.baseBracket(source)
    const tier = source.contextTiers.find((item) => item.aboveTokens === selected)
    return tier ? ContextPricing.tierBracket(tier) : ContextPricing.baseBracket(source)
  }

  static baseLabel(tiers: readonly ContextTierPrice[]): string {
    const first = ContextPricing.ordered(tiers)[0]
    return first ? `不超过 ${formatNumber(first.aboveTokens, 0)} tokens` : '基础档'
  }

  static tierLabel(tier: ContextTierPrice, tiers: readonly ContextTierPrice[]): string {
    const ordered = ContextPricing.ordered(tiers)
    const next = ordered[ordered.findIndex((item) => item.aboveTokens === tier.aboveTokens) + 1]
    if (!next) return `超过 ${formatNumber(tier.aboveTokens, 0)} tokens`
    return `${formatNumber(tier.aboveTokens + 1, 0)}–${formatNumber(next.aboveTokens, 0)} tokens`
  }

  static activeLabel(source: ModelPriceSource, contextTier: string, promptTokens: number): string {
    const bracket = ContextPricing.bracket(source, contextTier, promptTokens)
    if (bracket.aboveTokens === null) return ContextPricing.baseLabel(source.contextTiers)
    const tier = source.contextTiers.find((item) => item.aboveTokens === bracket.aboveTokens)
    return tier ? ContextPricing.tierLabel(tier, source.contextTiers) : ContextPricing.baseLabel(source.contextTiers)
  }

  private static pinnedTier(contextTier: string, tiers: readonly ContextTierPrice[]): number | null {
    if (contextTier === 'base') return null
    const size = Number(contextTier)
    if (!Number.isInteger(size) || size <= 0) return null
    return tiers.some((tier) => tier.aboveTokens === size) ? size : null
  }

  private static baseBracket(source: ModelPriceSource): PriceBracket {
    return {
      aboveTokens: null,
      inputUsdPerMillion: source.inputUsdPerMillion,
      cacheReadUsdPerMillion: source.cacheReadUsdPerMillion,
      cacheWriteUsdPerMillion: source.cacheWriteUsdPerMillion,
      outputUsdPerMillion: source.outputUsdPerMillion,
    }
  }

  private static tierBracket(tier: ContextTierPrice): PriceBracket {
    return {
      aboveTokens: tier.aboveTokens,
      inputUsdPerMillion: tier.inputUsdPerMillion,
      cacheReadUsdPerMillion: tier.cacheReadUsdPerMillion,
      cacheWriteUsdPerMillion: tier.cacheWriteUsdPerMillion,
      outputUsdPerMillion: tier.outputUsdPerMillion,
    }
  }
}

/** TTL choices sit on the selected bracket. The catalog stores one cache_write per tier, not a TTL matrix. */
export class CacheTtlPricing {
  static presets(providerId: string): readonly CacheTtlChoice[] {
    if (providerId === 'anthropic') return [CATALOG_TTL, ANTHROPIC_HOUR]
    if (providerId === 'openai') return [CATALOG_TTL, OPENAI_12H]
    return [CATALOG_TTL]
  }

  static choices(providerId: string, customTtls: readonly CustomTtlRow[]): CacheTtlChoice[] {
    return [
      ...CacheTtlPricing.presets(providerId),
      ...customTtls.map((row) => ({ id: row.id, label: row.label.trim() || '自定义', custom: true })),
    ]
  }

  static isCustom(ttlId: string, customTtls: readonly CustomTtlRow[]): boolean {
    return customTtls.some((row) => row.id === ttlId)
  }

  /** Null means the write price is the custom row, already stored in the scenario currency. */
  static writeUsd(providerId: string, bracket: PriceBracket, ttlId: string): number | null {
    if (ttlId === ANTHROPIC_HOUR.id && providerId === 'anthropic') return bracket.inputUsdPerMillion * 2
    if (ttlId === OPENAI_12H.id && providerId === 'openai') return bracket.inputUsdPerMillion * 2.5
    if (ttlId === CATALOG_TTL.id) return bracket.cacheWriteUsdPerMillion
    return null
  }
}
