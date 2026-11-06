import type { CacheDurationPrice, ContextTierPrice, ModelPriceSource } from './cost'

const MAX_NAME_LENGTH = 160
const MAX_CONTEXT_TIERS = 32
const MAX_TIER_TOKENS = 100_000_000
const MAX_CACHE_DURATIONS = 8
const MAX_DURATION_ID_LENGTH = 16
const MAX_UPDATED_LENGTH = 32

/**
 * One reader for a stored ModelPriceSource.
 * Scenario archives and the model catalog cache both use these checks.
 */
export class ModelPrice {
  /** Non-negative finite USD amounts, including models.dev cost fields. */
  static isPrice(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
  }

  /**
   * cacheWriteUsdPerMillion and contextTiers may be missing. Version 1 scenario
   * archives omit them, and normalize() fills 0 and []. A present tier still
   * requires every price, at most 32 tiers, and aboveTokens no higher than 100_000_000.
   */
  static isSource(value: unknown): value is ModelPriceSource {
    if (!ModelPrice.isRecord(value)) return false
    const names = ['providerId', 'providerName', 'modelId', 'modelName']
    const prices = ['inputUsdPerMillion', 'cacheReadUsdPerMillion', 'outputUsdPerMillion']
    const write = value.cacheWriteUsdPerMillion
    const updated = value.lastUpdated
    return names.every((field) => ModelPrice.isName(value[field]))
      && prices.every((field) => ModelPrice.isPrice(value[field]))
      && (write === undefined || ModelPrice.isPrice(write))
      && (value.contextTiers === undefined || ModelPrice.isTierList(value.contextTiers))
      && ModelPrice.isDurationList(value.cacheTtls)
      && (updated === null || (typeof updated === 'string' && updated.length <= MAX_UPDATED_LENGTH))
  }

  static normalize(source: ModelPriceSource): ModelPriceSource {
    const record = source as ModelPriceSource & {
      cacheWriteUsdPerMillion?: number
      contextTiers?: readonly ContextTierPrice[]
    }
    const cacheTtls = ModelPrice.copyDurations(record.cacheTtls)
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
            const tierTtls = ModelPrice.copyDurations(tier.cacheTtls)
            return tierTtls ? { ...tier, cacheTtls: tierTtls } : { ...tier }
          })
        : [],
      lastUpdated: source.lastUpdated,
    }
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private static isName(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_NAME_LENGTH
  }

  private static isTierList(value: unknown): boolean {
    return Array.isArray(value) && value.length <= MAX_CONTEXT_TIERS && value.every((tier) => ModelPrice.isTier(tier))
  }

  private static isTier(value: unknown): value is ContextTierPrice {
    if (!ModelPrice.isRecord(value)) return false
    return typeof value.aboveTokens === 'number'
      && Number.isInteger(value.aboveTokens)
      && value.aboveTokens > 0
      && value.aboveTokens <= MAX_TIER_TOKENS
      && ModelPrice.isPrice(value.inputUsdPerMillion)
      && ModelPrice.isPrice(value.cacheReadUsdPerMillion)
      && ModelPrice.isPrice(value.cacheWriteUsdPerMillion)
      && ModelPrice.isPrice(value.outputUsdPerMillion)
      && ModelPrice.isDurationList(value.cacheTtls)
  }

  private static isDurationList(value: unknown): boolean {
    return value === undefined
      || (Array.isArray(value) && value.length <= MAX_CACHE_DURATIONS && value.every((item) => ModelPrice.isDuration(item)))
  }

  private static isDuration(value: unknown): value is CacheDurationPrice {
    if (!ModelPrice.isRecord(value)) return false
    return typeof value.id === 'string'
      && value.id.length > 0
      && value.id.length <= MAX_DURATION_ID_LENGTH
      && ModelPrice.isPrice(value.writeUsdPerMillion)
  }

  private static copyDurations(value: unknown): CacheDurationPrice[] | undefined {
    if (!Array.isArray(value)) return undefined
    return value.map((item) => {
      const record = item as CacheDurationPrice
      return { id: record.id, writeUsdPerMillion: record.writeUsdPerMillion }
    })
  }
}
