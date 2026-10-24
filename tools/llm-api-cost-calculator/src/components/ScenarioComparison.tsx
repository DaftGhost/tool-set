import { formatMoney } from '../domain/currency'
import type { CurrencyCode } from '../domain/currency'
import type { CostBreakdown, ScenarioDraft } from '../domain/cost'

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
    <section className="comparison-panel" aria-labelledby="comparison-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">测算对象</p>
          <h2 id="comparison-title">方案</h2>
          <p className="section-hint">选择要编辑的方案，成本会随参数变化。</p>
        </div>
        <button className="button button-soft add-scenario" type="button" disabled={limitReached} onClick={onAdd}>
          <span aria-hidden="true">＋</span> 添加方案
        </button>
      </div>

      {limitReached && <p className="limit-note">最多比较 16 个方案。</p>}

      <div className="scenario-grid">
        {rows.map((row, index) => {
          const selected = row.draft.id === activeId
          const cheapest = row.draft.id === cheapestId
          const cardClass = ['scenario-card', selected && 'selected', cheapest && 'is-cheapest'].filter(Boolean).join(' ')
          const errorMessages = Object.values(row.errors)
          return (
            <article key={row.draft.id} className={cardClass}>
              <button
                className="scenario-main"
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(row.draft.id)}
              >
                <span className={`scenario-swatch swatch-${index % 16}`} />
                <span className="scenario-copy">
                  <span className="scenario-name">{scenarioName(row.draft.name)}</span>
                  {row.result
                    ? <span className="scenario-price">{formatMoney(row.result.totalCost, currency, usdToCny)}</span>
                    : <span className="scenario-price scenario-error">参数待修正</span>}
                </span>
                {cheapest && <span className="best-badge">最低</span>}
              </button>
              {rows.length > 1 && (
                <button
                  className="remove-scenario"
                  type="button"
                  aria-label={`删除${scenarioName(row.draft.name)}`}
                  onClick={() => onRemove(row.draft.id)}
                >×</button>
              )}
              <div className="scenario-detail">
                <span>输入 {row.draft.inputTokensM || '—'}M</span>
                <span>缓存 {row.draft.cacheHitPercent || '—'}%</span>
                <span>输出比 {row.draft.outputRatioPercent || '—'}%</span>
              </div>
              {errorMessages.length > 0 && <p className="scenario-warning">{errorMessages[0]}</p>}
            </article>
          )
        })}
      </div>
    </section>
  )
}
