import type { CacheDurationPrice, ContextTierPrice, ModelPriceSource, ScenarioDraft } from './cost'
import { formatNumber } from './cost'

export type PriceBracket = Readonly<{
  aboveTokens: number | null
  inputUsdPerMillion: number
  cacheReadUsdPerMillion: number
  cacheWriteUsdPerMillion: number
  cacheTtls: readonly CacheDurationPrice[]
  outputUsdPerMillion: number
}>

export type CacheTtlChoice = Readonly<{
  id: string
  label: string
}>

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

  /** The bracket is always the one the prompt has passed. A saved manual tier is not a choice. */
  static bracket(source: ModelPriceSource, promptTokens: number): PriceBracket {
    const selected = ContextPricing.aboveTokens(promptTokens, source.contextTiers)
    if (selected === null) return ContextPricing.baseBracket(source)
    const tier = source.contextTiers.find((item) => item.aboveTokens === selected)
    return tier ? ContextPricing.tierBracket(tier) : ContextPricing.baseBracket(source)
  }

  static baseLabel(tiers: readonly ContextTierPrice[]): string {
    const first = ContextPricing.ordered(tiers)[0]
    return first ? `不超过 ${formatNumber(first.aboveTokens, 0)} tokens` : ''
  }

  static tierLabel(tier: ContextTierPrice, tiers: readonly ContextTierPrice[]): string {
    const ordered = ContextPricing.ordered(tiers)
    const next = ordered[ordered.findIndex((item) => item.aboveTokens === tier.aboveTokens) + 1]
    if (!next) return `超过 ${formatNumber(tier.aboveTokens, 0)} tokens`
    return `${formatNumber(tier.aboveTokens + 1, 0)}–${formatNumber(next.aboveTokens, 0)} tokens`
  }

  static activeLabel(source: ModelPriceSource, promptTokens: number): string {
    const bracket = ContextPricing.bracket(source, promptTokens)
    if (bracket.aboveTokens === null) return ContextPricing.baseLabel(source.contextTiers)
    const tier = source.contextTiers.find((item) => item.aboveTokens === bracket.aboveTokens)
    return tier ? ContextPricing.tierLabel(tier, source.contextTiers) : ContextPricing.baseLabel(source.contextTiers)
  }

  static catalogPrices(
    source: ModelPriceSource,
    promptTokens: number,
    ttlId: string,
    usdToCny: number,
  ): Pick<ScenarioDraft, 'cachedPrice' | 'cacheWritePrice' | 'uncachedPrice' | 'outputPrice'> {
    const bracket = ContextPricing.bracket(source, promptTokens)
    const writeUsd = CacheTtlPricing.writeUsd(bracket, ttlId)
    return {
      cachedPrice: ContextPricing.compactPrice(bracket.cacheReadUsdPerMillion * usdToCny),
      cacheWritePrice: ContextPricing.compactPrice(writeUsd * usdToCny),
      uncachedPrice: ContextPricing.compactPrice(bracket.inputUsdPerMillion * usdToCny),
      outputPrice: ContextPricing.compactPrice(bracket.outputUsdPerMillion * usdToCny),
    }
  }

  private static compactPrice(value: number): string {
    return Number(value.toPrecision(15)).toString()
  }

  private static baseBracket(source: ModelPriceSource): PriceBracket {
    return {
      aboveTokens: null,
      inputUsdPerMillion: source.inputUsdPerMillion,
      cacheReadUsdPerMillion: source.cacheReadUsdPerMillion,
      cacheWriteUsdPerMillion: source.cacheWriteUsdPerMillion,
      cacheTtls: source.cacheTtls ?? [],
      outputUsdPerMillion: source.outputUsdPerMillion,
    }
  }

  private static tierBracket(tier: ContextTierPrice): PriceBracket {
    return {
      aboveTokens: tier.aboveTokens,
      inputUsdPerMillion: tier.inputUsdPerMillion,
      cacheReadUsdPerMillion: tier.cacheReadUsdPerMillion,
      cacheWriteUsdPerMillion: tier.cacheWriteUsdPerMillion,
      cacheTtls: tier.cacheTtls ?? [],
      outputUsdPerMillion: tier.outputUsdPerMillion,
    }
  }
}

/** Durations come only from a models.dev cache_write map. One price is not a choice. */
export class CacheTtlPricing {
  static choices(ttls: readonly CacheDurationPrice[]): CacheTtlChoice[] {
    if (ttls.length < 2) return []
    return ttls.map((ttl) => ({ id: ttl.id, label: ttl.id }))
  }

  static writeUsd(bracket: PriceBracket, ttlId: string): number {
    const listed = bracket.cacheTtls.find((ttl) => ttl.id === ttlId)
    return listed ? listed.writeUsdPerMillion : bracket.cacheWriteUsdPerMillion
  }
}
