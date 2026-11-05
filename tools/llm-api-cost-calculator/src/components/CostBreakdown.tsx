import { formatNumber } from '../domain/cost'
import type { CostBreakdown as CostBreakdownResult } from '../domain/cost'
import { formatMoney } from '../domain/currency'
import type { CurrencyCode } from '../domain/currency'

type CostBreakdownProps = {
  result: CostBreakdownResult | null
  currency: CurrencyCode
  usdToCny: number
}

type CostDot = 'input' | 'cached' | 'write' | 'uncached' | 'output'

function CostLine({
  title,
  detail,
  amount,
  dot,
  sub = false,
}: {
  title: string
  detail: string
  amount: string
  dot: CostDot
  sub?: boolean
}) {
  const dotClass = dot === 'input'
    ? 'size-2 shrink-0 rounded-full bg-ink'
    : dot === 'cached'
      ? 'size-2 shrink-0 rounded-full bg-primary'
      : dot === 'write'
        ? 'size-2 shrink-0 rounded-full bg-primary-deep'
        : dot === 'uncached'
          ? 'size-2 shrink-0 rounded-full bg-clay'
          : 'size-2 shrink-0 rounded-full bg-brass'

  return (
    <div className={sub
      ? 'flex items-center gap-2.5 py-2.5 pl-2.5 max-phone:py-2'
      : 'flex items-center gap-2.5 border-b border-line-soft py-4 max-phone:py-3.5'}>
      <span className={dotClass} />
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2 max-phone:flex-col max-phone:items-start max-phone:gap-1">
        <span className={sub ? 'text-meta text-muted max-phone:text-micro' : 'text-label text-ink max-phone:text-meta'}>{title}</span>
        <small className="whitespace-nowrap font-mono text-micro text-quiet">{detail}</small>
      </div>
      <strong className={sub
        ? 'shrink-0 font-mono text-meta font-medium text-muted'
        : 'shrink-0 font-mono text-ui font-medium text-ink max-phone:text-label'}>{amount}</strong>
    </div>
  )
}

export function CostBreakdown({ result, currency, usdToCny }: CostBreakdownProps) {
  const total = result?.totalCost ?? 0
  const money = (value: number) => formatMoney(value, currency, usdToCny)
  const pieces = !result || total === 0
    ? [
        { key: 'cached', color: 'cached' as const, width: 0 },
        { key: 'write', color: 'write' as const, width: 0 },
        { key: 'uncached', color: 'uncached' as const, width: 0 },
        { key: 'output', color: 'output' as const, width: 0 },
      ]
    : [
        { key: 'cached', color: 'cached' as const, width: result.cachedCost / total * 100 },
        { key: 'write', color: 'write' as const, width: result.cacheWriteCost / total * 100 },
        { key: 'uncached', color: 'uncached' as const, width: result.uncachedCost / total * 100 },
        { key: 'output', color: 'output' as const, width: result.outputCost / total * 100 },
      ]
  const barLabel = result
    ? [
        `缓存输入 ${money(result.cachedCost)}`,
        ...(result.cacheWriteCost !== 0 ? [`缓存写入 ${money(result.cacheWriteCost)}`] : []),
        `未缓存输入 ${money(result.uncachedCost)}`,
        `输出 ${money(result.outputCost)}`,
      ].join('，')
    : ''

  return (
    <section className="relative flex flex-col overflow-hidden rounded-panel border border-line bg-surface px-panel pb-5 pt-panel shadow-panel max-phone:px-4 max-phone:pb-4 max-phone:pt-5" aria-labelledby="summary-title">
      <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="m-0 mb-1 font-mono text-meta tracking-eyebrow text-muted">估算 · 单次请求</p>
          <h2 id="summary-title" className="m-0 text-section">成本拆分</h2>
        </div>
        <span className="whitespace-nowrap rounded-badge bg-surface-alt px-2 py-1.5 font-mono text-micro text-muted">{currency} / 请求</span>
      </div>

      {result ? (
        <div className="mt-5 max-phone:mt-4">
          <div className="total-block flex items-center justify-between gap-3 rounded-inset bg-primary-deep p-5 max-phone:p-4">
            <span className="text-ui text-on-deep-muted max-phone:text-meta">预估总成本</span>
            <strong className="total-figure whitespace-nowrap text-primary-soft">{money(result.totalCost)}</strong>
          </div>

          <div
            className="mx-px my-5 flex h-2 gap-1 overflow-hidden rounded-full bg-surface-alt max-phone:mb-2.5 max-phone:mt-4"
            role="img"
            aria-label={barLabel}
          >
            {pieces.filter((piece) => piece.width > 0).map((piece) => (
              <span
                key={piece.key}
                className={piece.color === 'cached'
                  ? 'min-w-0 rounded-full bg-primary'
                  : piece.color === 'write'
                    ? 'min-w-0 rounded-full bg-primary-deep'
                    : piece.color === 'uncached'
                      ? 'min-w-0 rounded-full bg-clay'
                      : 'min-w-0 rounded-full bg-brass'}
                style={{ width: `${piece.width}%` }}
              />
            ))}
          </div>

          <div>
            <CostLine title="输入成本" detail={`${formatNumber(result.inputTokens / 1_000_000)}M tokens`} amount={money(result.inputCost)} dot="input" />
            <CostLine title="缓存命中" detail={`${formatNumber(result.cachedTokens / 1_000_000)}M tokens`} amount={money(result.cachedCost)} dot="cached" sub />
            <CostLine title="缓存写入" detail={`${formatNumber(result.cacheWriteTokens / 1_000_000)}M tokens`} amount={money(result.cacheWriteCost)} dot="write" sub />
            <CostLine title="未缓存输入" detail={`${formatNumber(result.uncachedTokens / 1_000_000)}M tokens`} amount={money(result.uncachedCost)} dot="uncached" sub />
            <CostLine title="输出成本" detail={`${formatNumber(result.outputTokens / 1_000_000)}M tokens`} amount={money(result.outputCost)} dot="output" />
          </div>

          <p className="m-0 mt-3.5 text-micro text-quiet">按当前单价估算；实际账单可能因供应商计费规则而异。</p>
        </div>
      ) : (
        <div className="summary-placeholder flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted" role="status">
          <span className="flex size-gutter items-center justify-center rounded-full bg-brass-soft font-extrabold text-warn">!</span>
          <p className="m-0 max-w-summary text-ui">完善左侧参数后，这里会显示成本拆分。</p>
        </div>
      )}
    </section>
  )
}
