import { formatMoney } from '../domain/currency'
import type { CurrencyCode } from '../domain/currency'
import type { CostBreakdown, ScenarioDraft } from '../domain/cost'
import { scenarioSwatchClass } from '../scenarioSwatch'

export type ComparisonRow = {
  draft: ScenarioDraft
  result: CostBreakdown | null
  errors: Record<string, string>
}

type ScenarioComparisonProps = {
  rows: ComparisonRow[]
  activeId: string
  limitReached: boolean
  currency: CurrencyCode
  usdToCny: number
  onSelect(id: string): void
  onRemove(id: string): void
  onAdd(): void
}

function scenarioName(name: string): string {
  return name.trim() || '未命名方案'
}

function scenarioCardClass(selected: boolean, cheapest: boolean): string {
  const state = selected
    ? 'border-primary bg-primary-soft'
    : cheapest
      ? 'border-primary-muted bg-surface'
      : 'border-line bg-surface'
  return `relative min-w-0 rounded-inset border px-3.5 pb-3 pt-3.5 transition-colors max-phone:px-3 max-phone:pb-2.5 max-phone:pt-3 ${state}`
}

export function ScenarioComparison({
  rows,
  activeId,
  limitReached,
  currency,
  usdToCny,
  onSelect,
  onRemove,
  onAdd,
}: ScenarioComparisonProps) {
  const priced = rows.filter(({ result }) => result !== null)
  const cheapestId = priced.length < 2
    ? null
    : priced.reduce((best, candidate) => candidate.result!.totalCost < best.result!.totalCost ? candidate : best).draft.id

  return (
    <section className="mb-section rounded-panel border border-line bg-surface px-panel pb-panel pt-panel shadow-panel max-phone:mb-3 max-phone:px-4 max-phone:pb-4 max-phone:pt-section" aria-labelledby="comparison-title">
      <div className="mb-section flex items-center justify-between gap-4 max-phone:mb-3.5 max-phone:items-start">
        <div>
          <p className="m-0 mb-2 font-mono text-meta tracking-eyebrow text-muted">测算对象</p>
          <h2 id="comparison-title" className="m-0 text-section">方案</h2>
          <p className="m-0 mt-1.5 text-label text-muted max-phone:text-meta">选择要编辑的方案，成本会随参数变化。</p>
        </div>
        <button className="inline-flex min-h-control cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border-0 bg-primary-soft px-3 text-label font-bold text-primary-deep transition-colors hover:bg-primary-soft-hover disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-quiet max-phone:px-2.5 max-phone:text-meta" type="button" disabled={limitReached} onClick={onAdd}>
          <span className="text-symbol font-normal" aria-hidden="true">＋</span> 添加方案
        </button>
      </div>

      {limitReached && <p className="-mt-2 mb-3 text-meta text-muted">最多比较 16 个方案。</p>}

      <div className="scenario-grid">
        {rows.map((row, index) => {
          const selected = row.draft.id === activeId
          const cheapest = row.draft.id === cheapestId
          const errorMessages = Object.values(row.errors)
          return (
            <article key={row.draft.id} className={scenarioCardClass(selected, cheapest)}>
              <button
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 pr-gutter text-left"
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(row.draft.id)}
              >
                <span className={`inline-flex size-2 shrink-0 rounded-full ${scenarioSwatchClass(index)}`} />
                <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                  <span className="truncate text-label font-bold text-ink">{scenarioName(row.draft.name)}</span>
                  {row.result
                    ? <span className="shrink-0 font-mono text-ui text-ink">{formatMoney(row.result.totalCost, currency, usdToCny)}</span>
                    : <span className="shrink-0 text-meta text-danger">参数待修正</span>}
                </span>
                {cheapest && <span className="shrink-0 whitespace-nowrap rounded-badge bg-primary-soft px-1.5 py-1 text-micro text-primary-deep">最低</span>}
              </button>
              {rows.length > 1 && (
                <button
                  className="absolute top-1.5 right-1.5 size-panel cursor-pointer rounded-control border-0 bg-transparent text-symbol text-quiet hover:bg-warn-bg hover:text-danger-deep"
                  type="button"
                  aria-label={`删除${scenarioName(row.draft.name)}`}
                  onClick={() => onRemove(row.draft.id)}
                >×</button>
              )}
              <div className="mt-3 ml-section flex flex-wrap gap-1.5 max-phone:mt-2">
                <span className={selected ? 'rounded-badge bg-primary-soft px-1.5 py-1 font-mono text-micro text-primary-deep' : 'rounded-badge bg-surface-alt px-1.5 py-1 font-mono text-micro text-muted'}>输入 {row.draft.inputTokensM || '—'}M</span>
                <span className={selected ? 'rounded-badge bg-primary-soft px-1.5 py-1 font-mono text-micro text-primary-deep' : 'rounded-badge bg-surface-alt px-1.5 py-1 font-mono text-micro text-muted'}>缓存 {row.draft.cacheHitPercent || '—'}%</span>
                <span className={selected ? 'rounded-badge bg-primary-soft px-1.5 py-1 font-mono text-micro text-primary-deep' : 'rounded-badge bg-surface-alt px-1.5 py-1 font-mono text-micro text-muted'}>输出比 {row.draft.outputRatioPercent || '—'}%</span>
              </div>
              {errorMessages.length > 0 && <p className="m-0 mt-2 ml-section text-meta text-danger">{errorMessages[0]}</p>}
            </article>
          )
        })}
      </div>
    </section>
  )
}
