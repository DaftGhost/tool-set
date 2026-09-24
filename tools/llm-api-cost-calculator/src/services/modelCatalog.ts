import type { ModelPriceSource } from '../domain/cost'

const MODELS_DEV_API = 'https://models.dev/api.json'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160
}

function supportsText(value: unknown): boolean {
  if (!isRecord(value)) return false
  const input = value.input
  const output = value.output
  return Array.isArray(input) && input.includes('text')
    && Array.isArray(output) && output.includes('text')
}

/** Returns named, non-deprecated models with usable input and output prices. */
export async function fetchModelCatalog(): Promise<ModelPriceSource[]> {
  const response = await fetch(MODELS_DEV_API, {
    headers: { Accept: 'application/json' },
    cache: 'no-cache',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`)

  const payload: unknown = await response.json()
  if (!isRecord(payload)) throw new Error('models.dev catalog is not an object')

  const models: ModelPriceSource[] = []
  for (const [providerId, rawProvider] of Object.entries(payload)) {
    if (!isName(providerId) || !isRecord(rawProvider) || !isName(rawProvider.name) || !isRecord(rawProvider.models)) continue

    for (const [modelId, rawModel] of Object.entries(rawProvider.models)) {
      if (!isName(modelId) || !isRecord(rawModel) || !isName(rawModel.name) || rawModel.status === 'deprecated') continue
      if (!isRecord(rawModel.cost) || !supportsText(rawModel.modalities)) continue

      const input = rawModel.cost.input
      const output = rawModel.cost.output
      const cacheRead = rawModel.cost.cache_read
      if (!isPrice(input) || !isPrice(output) || (cacheRead != null && !isPrice(cacheRead))) continue

      models.push({
        providerId,
        providerName: rawProvider.name,
        modelId,
        modelName: rawModel.name,
        inputUsdPerMillion: input,
        cacheReadUsdPerMillion: cacheRead ?? input,
        outputUsdPerMillion: output,
        lastUpdated: typeof rawModel.last_updated === 'string' && rawModel.last_updated.length <= 32
          ? rawModel.last_updated
          : null,
      })
    }
  }

  if (models.length === 0) throw new Error('models.dev catalog contains no priced models')
  return models.sort((left, right) =>
    left.providerName.localeCompare(right.providerName)
    || left.modelName.localeCompare(right.modelName)
    || left.modelId.localeCompare(right.modelId),
  )
}
