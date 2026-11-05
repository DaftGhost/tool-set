import type { ScenarioDraft } from '../domain/cost'
import { CacheTtlPricing, ContextPricing } from '../domain/pricing'
import { MAX_CUSTOM_TTLS } from '../domain/scenarios'

type ContextPricingControlsProps = {
  scenario: ScenarioDraft
  onContextTier(value: string): void
  onCacheTtl(id: string): void
  onAddCustomTtl(): void
  onRenameCustomTtl(id: string, label: string): void
  onRemoveCustomTtl(id: string): void
}

const selectClass = 'w-full min-w-0 rounded-control border border-line bg-surface px-2 py-2 text-label text-ink'

export function ContextPricingControls({
  scenario,
  onContextTier,
  onCacheTtl,
  onAddCustomTtl,
  onRenameCustomTtl,
  onRemoveCustomTtl,
}: ContextPricingControlsProps) {
  const source = scenario.modelPriceSource
  if (!source) return null

  const tiers = ContextPricing.ordered(source.contextTiers)
  const promptTokens = ContextPricing.promptTokens(scenario.inputTokensM)
  const activeLabel = ContextPricing.activeLabel(source, scenario.contextTier, promptTokens)
  const ttlChoices = CacheTtlPricing.choices(source.providerId, scenario.customTtls)
  const ttlValue = ttlChoices.some((choice) => choice.id === scenario.cacheTtlId) ? scenario.cacheTtlId : 'catalog'
  const custom = scenario.customTtls.find((row) => row.id === scenario.cacheTtlId) ?? null

  return (
    <div className="mb-4 grid gap-3">
      <div className="grid gap-3 max-phone:grid-cols-1 grid-cols-2">
        {tiers.length > 0 && (
          <div className="min-w-0">
            <label className="mb-1.5 block text-label font-bold text-ink" htmlFor="context-tier">上下文档位</label>
            <select
              id="context-tier"
              className={selectClass}
              value={scenario.contextTier}
              onChange={(event) => onContextTier(event.target.value)}
            >
              <option value="auto">按本次输入</option>
              <option value="base">{ContextPricing.baseLabel(tiers)}</option>
              {tiers.map((tier) => (
                <option key={tier.aboveTokens} value={String(tier.aboveTokens)}>
                  {ContextPricing.tierLabel(tier, tiers)}
                </option>
              ))}
            </select>
          </div>
        )}
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
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="cursor-pointer rounded-control border border-line bg-surface px-2 py-1 text-meta text-primary-deep disabled:cursor-not-allowed disabled:text-quiet"
          type="button"
          disabled={scenario.customTtls.length >= MAX_CUSTOM_TTLS}
          onClick={onAddCustomTtl}
        >添加时长</button>
        {custom && (
          <>
            <label className="text-meta text-muted" htmlFor="custom-ttl-label">时长名称</label>
            <input
              id="custom-ttl-label"
              className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1 text-label text-ink"
              value={custom.label}
              maxLength={32}
              onChange={(event) => onRenameCustomTtl(custom.id, event.target.value)}
            />
            <button
              className="cursor-pointer rounded-control border border-line bg-surface px-2 py-1 text-meta text-primary-deep"
              type="button"
              onClick={() => onRemoveCustomTtl(custom.id)}
            >移除此时长</button>
          </>
        )}
      </div>
      <p className="m-0 text-meta text-quiet">
        当前档位：{activeLabel}。整段请求使用这一档单价。目录默认采用该档缓存写入价；更长时长按厂商倍数，自定义时长可手填写入价。
      </p>
    </div>
  )
}
