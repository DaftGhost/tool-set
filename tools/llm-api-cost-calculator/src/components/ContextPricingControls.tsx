import type { ScenarioDraft } from '../domain/cost'
import { CacheTtlPricing, ContextPricing } from '../domain/pricing'

type ContextPricingControlsProps = {
  scenario: ScenarioDraft
  onCacheTtl(id: string): void
}

const selectClass = 'w-full min-w-0 rounded-control border border-line bg-surface px-2 py-2 text-label text-ink'

export function ContextPricingControls({ scenario, onCacheTtl }: ContextPricingControlsProps) {
  const source = scenario.modelPriceSource
  if (!source) return null

  const tiers = ContextPricing.ordered(source.contextTiers)
  const promptTokens = ContextPricing.promptTokens(scenario.inputTokensM)
  const bracket = ContextPricing.bracket(source, promptTokens)
  const ttlChoices = CacheTtlPricing.choices(bracket.cacheTtls)
  const ttlValue = ttlChoices.some((choice) => choice.id === scenario.cacheTtlId) ? scenario.cacheTtlId : ttlChoices[0]?.id ?? ''
  if (tiers.length === 0 && ttlChoices.length === 0) return null

  return (
    <div className="mb-4 grid gap-3">
      {ttlChoices.length > 0 && (
        <div className="grid grid-cols-2 gap-3 max-phone:grid-cols-1">
          <div className="min-w-0">
            <label className="mb-1.5 block text-label font-bold text-ink" htmlFor="cache-ttl">缓存时长</label>
            <select
              id="cache-ttl"
              className={selectClass}
              value={ttlValue}
              onChange={(event) => onCacheTtl(event.target.value)}
            >
              {ttlChoices.map((choice) => (
                <option key={choice.id} value={choice.id}>{choice.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      {tiers.length > 0 && (
        <p className="m-0 text-meta text-quiet">{ContextPricing.activeLabel(source, promptTokens)}。整段请求使用这一档单价。</p>
      )}
    </div>
  )
}
