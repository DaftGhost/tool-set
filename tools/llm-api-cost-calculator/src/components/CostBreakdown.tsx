import { formatNumber } from '../domain/cost'
import type { CostBreakdown as CostBreakdownResult } from '../domain/cost'
import { formatMoney } from '../domain/currency'
import type { CurrencyCode } from '../domain/currency'

type CostBreakdownProps = {
  result: CostBreakdownResult | null
  currency: CurrencyCode
  usdToCny: number
}

export function CostBreakdown({ result, currency, usdToCny }: CostBreakdownProps) {
  const total = result?.totalCost ?? 0
  const money = (value: number) => formatMoney(value, currency, usdToCny)
  const pieces = !result || total === 0
    ? [
        { key: 'cached', label: '缓存输入', color: 'cached', width: 0 },
        { key: 'uncached', label: '未缓存输入', color: 'uncached', width: 0 },
        { key: 'output', label: '输出', color: 'output', width: 0 },
      ]
    : [
        { key: 'cached', label: '缓存输入', color: 'cached', width: result.cachedCost / total * 100 },
        { key: 'uncached', label: '未缓存输入', color: 'uncached', width: result.uncachedCost / total * 100 },
        { key: 'output', label: '输出', color: 'output', width: result.outputCost / total * 100 },
      ]

  return (
    <section className="summary-card" aria-labelledby="summary-title">
      <div className="summary-topline">
        <div>
          <p className="eyebrow">估算 · 单次请求</p>
          <h2 id="summary-title">成本拆分</h2>
        </div>
        <span className="summary-scope">{currency} / 请求</span>
      </div>

      {result ? (
        <div className="summary-content">
          <div className="total-display">
            <span>预估总成本</span>
            <strong>{money(result.totalCost)}</strong>
          </div>

          <div
            className="cost-rail"
            role="img"
            aria-label={`缓存输入 ${money(result.cachedCost)}，未缓存输入 ${money(result.uncachedCost)}，输出 ${money(result.outputCost)}`}
          >
            {pieces.map((piece) => (
              <span key={piece.key} className={`rail-${piece.color}`} style={{ width: `${piece.width}%` }} />
            ))}
          </div>

          <div className="cost-lines">
            <div className="cost-line">
              <span className="line-dot dot-input" />
              <div className="line-copy">
                <span className="line-title">输入成本</span>
                <small>{formatNumber(result.inputTokens / 1_000_000)}M tokens</small>
              </div>
              <strong>{money(result.inputCost)}</strong>
            </div>
            <div className="cost-line cost-subline">
              <span className="line-dot dot-cached" />
              <div className="line-copy">
                <span className="line-title">缓存命中</span>
                <small>{formatNumber(result.cachedTokens / 1_000_000)}M tokens</small>
              </div>
              <strong>{money(result.cachedCost)}</strong>
            </div>
            <div className="cost-line cost-subline">
              <span className="line-dot dot-uncached" />
              <div className="line-copy">
                <span className="line-title">未缓存输入</span>
                <small>{formatNumber(result.uncachedTokens / 1_000_000)}M tokens</small>
              </div>
              <strong>{money(result.uncachedCost)}</strong>
            </div>
            <div className="cost-line">
              <span className="line-dot dot-output" />
              <div className="line-copy">
                <span className="line-title">输出成本</span>
                <small>{formatNumber(result.outputTokens / 1_000_000)}M tokens</small>
              </div>
              <strong>{money(result.outputCost)}</strong>
            </div>
          </div>

          <p className="summary-footnote">按当前单价估算；实际账单可能因供应商计费规则而异。</p>
        </div>
      ) : (
        <div className="summary-invalid" role="status">
          <span className="invalid-mark">!</span>
          <p>完善左侧参数后，这里会显示成本拆分。</p>
        </div>
      )}
    </section>
  )
}
