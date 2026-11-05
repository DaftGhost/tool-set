import type { ContextTierPrice, ModelPriceSource } from '../domain/cost'

const MODELS_DEV_API = 'https://models.dev/catalog.json'

// Product-specific API endpoints still belong to the model lab in models.dev.
const PROVIDER_LAB_ALIASES = new Map([
  ['alibaba-cn', 'alibaba'],
  ['alibaba-coding-plan', 'alibaba'],
  ['alibaba-coding-plan-cn', 'alibaba'],
  ['alibaba-token-plan', 'alibaba'],
  ['alibaba-token-plan-cn', 'alibaba'],
  ['minimax-cn', 'minimax'],
  ['minimax-coding-plan', 'minimax'],
  ['minimax-cn-coding-plan', 'minimax'],
  ['moonshotai-cn', 'moonshotai'],
  ['zhipuai-coding-plan', 'zhipuai'],
])

export type ModelCatalogEntry = Readonly<{
  source: ModelPriceSource
  isFirstParty: boolean
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160
}

type BasePrices = Readonly<{
  inputUsdPerMillion: number
  outputUsdPerMillion: number
  cacheReadUsdPerMillion: number
  cacheWriteUsdPerMillion: number
}>

/** Reads models.dev cost objects, including context tiers with nested cache prices. */
export class CatalogCost {
  static read(cost: unknown): (BasePrices & { contextTiers: ContextTierPrice[] }) | null {
    if (!isRecord(cost) || !isPrice(cost.input) || !isPrice(cost.output)) return null
    if (cost.cache_read != null && !isPrice(cost.cache_read)) return null

    const base: BasePrices = {
      inputUsdPerMillion: cost.input,
      outputUsdPerMillion: cost.output,
      cacheReadUsdPerMillion: isPrice(cost.cache_read) ? cost.cache_read : cost.input,
      cacheWriteUsdPerMillion: isPrice(cost.cache_write) ? cost.cache_write : 0,
    }
    return { ...base, contextTiers: CatalogCost.tiers(cost, base) }
  }

  static tiers(cost: Record<string, unknown>, base: BasePrices): ContextTierPrice[] {
    const collected: ContextTierPrice[] = []
    const seen = new Set<number>()
    const rawTiers = Array.isArray(cost.tiers) ? cost.tiers : []
    for (const raw of rawTiers) {
      const tier = CatalogCost.contextTier(raw, base)
      if (!tier || seen.has(tier.aboveTokens)) continue
      seen.add(tier.aboveTokens)
      collected.push(tier)
    }

    // context_over_200k repeats the tiered long-context price under an older 200k name.
    // When cost.tiers already has a context cliff, that list is the threshold.
    if (collected.length === 0 && isRecord(cost.context_over_200k)) {
      const legacy = CatalogCost.contextTier({
        ...cost.context_over_200k,
        tier: { type: 'context', size: 200_000 },
      }, base)
      if (legacy) collected.push(legacy)
    }

    collected.sort((left, right) => left.aboveTokens - right.aboveTokens)
    return collected
  }

  static contextTier(raw: unknown, base: BasePrices): ContextTierPrice | null {
    if (!isRecord(raw) || !isRecord(raw.tier) || raw.tier.type !== 'context') return null
    const size = raw.tier.size
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0 || size > 100_000_000) return null
    if (!CatalogCost.hasBillablePrice(raw)) return null

    return {
      aboveTokens: size,
      inputUsdPerMillion: CatalogCost.priceOr(raw.input, base.inputUsdPerMillion),
      outputUsdPerMillion: CatalogCost.priceOr(raw.output, base.outputUsdPerMillion),
      cacheReadUsdPerMillion: CatalogCost.priceOr(raw.cache_read, base.cacheReadUsdPerMillion),
      cacheWriteUsdPerMillion: CatalogCost.priceOr(raw.cache_write, base.cacheWriteUsdPerMillion),
    }
  }

  static hasBillablePrice(raw: Record<string, unknown>): boolean {
    const keys = ['input', 'output', 'cache_read', 'cache_write'] as const
    const present = keys.filter((key) => raw[key] !== undefined)
    return present.some((key) => isPrice(raw[key]) && raw[key] > 0)
  }

  static priceOr(value: unknown, fallback: number): number {
    return isPrice(value) ? value : fallback
  }
}

function supportsText(value: unknown): boolean {
  if (!isRecord(value)) return false
  const input = value.input
  const output = value.output
  return Array.isArray(input) && input.includes('text')
    && Array.isArray(output) && output.includes('text')
}

function addLab(index: Map<string, Set<string>>, key: string, labId: string) {
  const labs = index.get(key) ?? new Set<string>()
  labs.add(labId)
  index.set(key, labs)
}

function uniqueLab(labs: Set<string> | undefined): string | null {
  return labs?.size === 1 ? labs.values().next().value ?? null : null
}

function normalizeModelId(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
}

function findModelLab(
  modelId: string,
  rawModel: Record<string, unknown>,
  labsById: Map<string, Set<string>>,
  labsByFamily: Map<string, Set<string>>,
): string | null {
  const sourceId = typeof rawModel.id === 'string' ? rawModel.id : modelId
  const idLab = uniqueLab(labsById.get(normalizeModelId(sourceId.split('/').at(-1) ?? sourceId)))
  if (idLab) return idLab

  const family = rawModel.family
  return isName(family) ? uniqueLab(labsByFamily.get(family)) : null
}

/** Returns priced provider models, marking first-party prices only when the lab is unambiguous. */
export async function fetchModelCatalog(): Promise<ModelCatalogEntry[]> {
  const response = await fetch(MODELS_DEV_API, {
    headers: { Accept: 'application/json' },
    cache: 'no-cache',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`)

  const payload: unknown = await response.json()
  if (!isRecord(payload)) throw new Error('models.dev catalog is not an object')
  if (!isRecord(payload.providers) || !isRecord(payload.models)) {
    throw new Error('models.dev catalog is missing providers or model metadata')
  }

  const labsById = new Map<string, Set<string>>()
  const labsByFamily = new Map<string, Set<string>>()
  for (const [canonicalId, rawModel] of Object.entries(payload.models)) {
    if (!isRecord(rawModel)) continue
    const [labId, ...modelIdParts] = canonicalId.split('/')
    const canonicalModelId = modelIdParts.at(-1)
    if (!isName(labId) || !canonicalModelId) continue
    addLab(labsById, normalizeModelId(canonicalModelId), labId)
    if (isName(rawModel.family)) addLab(labsByFamily, rawModel.family, labId)
  }

  const models: ModelCatalogEntry[] = []
  for (const [providerId, rawProvider] of Object.entries(payload.providers)) {
    if (!isName(providerId) || !isRecord(rawProvider) || !isName(rawProvider.name) || !isRecord(rawProvider.models)) continue

    for (const [modelId, rawModel] of Object.entries(rawProvider.models)) {
      if (!isName(modelId) || !isRecord(rawModel) || !isName(rawModel.name) || rawModel.status === 'deprecated') continue
      if (!isRecord(rawModel.cost) || !supportsText(rawModel.modalities)) continue

      const priced = CatalogCost.read(rawModel.cost)
      if (!priced) continue

      const modelLab = findModelLab(modelId, rawModel, labsById, labsByFamily)
      const providerLab = PROVIDER_LAB_ALIASES.get(providerId) ?? providerId
      models.push({
        source: {
          providerId,
          providerName: rawProvider.name,
          modelId,
          modelName: rawModel.name,
          inputUsdPerMillion: priced.inputUsdPerMillion,
          cacheReadUsdPerMillion: priced.cacheReadUsdPerMillion,
          cacheWriteUsdPerMillion: priced.cacheWriteUsdPerMillion,
          outputUsdPerMillion: priced.outputUsdPerMillion,
          contextTiers: priced.contextTiers,
          lastUpdated: typeof rawModel.last_updated === 'string' && rawModel.last_updated.length <= 32
            ? rawModel.last_updated
            : null,
        },
        isFirstParty: modelLab !== null && providerLab === modelLab,
      })
    }
  }

  if (models.length === 0) throw new Error('models.dev catalog contains no priced models')
  return models.sort((left, right) =>
    Number(right.isFirstParty) - Number(left.isFirstParty)
    || left.source.providerName.localeCompare(right.source.providerName)
    || left.source.modelName.localeCompare(right.source.modelName)
    || left.source.modelId.localeCompare(right.source.modelId),
  )
}
