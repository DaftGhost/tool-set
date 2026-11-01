import { Fragment, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { calculateCost, formatNumber } from '../domain/cost'
import type { CostBreakdown } from '../domain/cost'
import { formatMoney } from '../domain/currency'
import type { CurrencyCode } from '../domain/currency'
import { axisLabel, buildChartModel, inputAtAxis, metricLabel } from '../domain/chart'
import type { ChartAxis, ChartEntry, CostMetric } from '../domain/chart'
import { scenarioColor, scenarioSwatchClass } from '../scenarioSwatch'

type CostChartProps = {
  entries: Array<ChartEntry & { colorIndex: number }>
  axis: ChartAxis
  metric: CostMetric
  cursorFraction: number
  selectedKey: string | null
  currency: CurrencyCode
  usdToCny: number
  onAxisChange(axis: ChartAxis): void
  onMetricChange(metric: CostMetric): void
  onCursorFractionChange(fraction: number): void
  onSelectIntersection(key: string): void
}

const plot = { left: 86, top: 32, right: 890, bottom: 362 }
const plotWidth = plot.right - plot.left
const plotHeight = plot.bottom - plot.top
const AXIS_OPTIONS = [
  { value: 'cacheHitPercent', label: '缓存命中率' },
  { value: 'inputTokensM', label: '输入 Token' },
  { value: 'outputRatioPercent', label: '输出 / 输入比' },
] as const
const METRIC_OPTIONS = [
  { value: 'total', label: '总成本' },
  { value: 'input', label: '输入' },
  { value: 'output', label: '输出' },
] as const
const X_FRACTIONS = [0, 0.25, 0.5, 0.75, 1]

function segmentClass(pressed: boolean): string {
  return pressed
    ? 'cursor-pointer rounded-control border border-primary bg-primary-soft px-2.5 py-2 text-meta text-primary-deep transition-colors max-phone:px-2 max-phone:py-1.5 max-phone:text-micro'
    : 'cursor-pointer rounded-control border border-line bg-surface px-2.5 py-2 text-meta text-muted transition-colors hover:border-primary-muted max-phone:px-2 max-phone:py-1.5 max-phone:text-micro'
}

export function CostChart({
  entries,
  axis,
  metric,
  cursorFraction,
  selectedKey,
  currency,
  usdToCny,
  onAxisChange,
  onMetricChange,
  onCursorFractionChange,
  onSelectIntersection,
}: CostChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const model = buildChartModel(entries, axis, metric, cursorFraction)
  const yTicks = Array.from({ length: 5 }, (_, index) => model.yMaximum * index / 4)
  const yFractionDigits = model.yMaximum < 0.01 ? 6 : model.yMaximum < 1 ? 4 : model.yMaximum < 100 ? 3 : 2
  const visibleIntersection = model.intersections.find(({ key }) => key === selectedKey) ?? null
  const cheapestAtCursor = model.cursorCosts.find(({ id }) => id === model.lowestCostId) ?? null

  const xFor = (fraction: number) => plot.left + fraction * plotWidth
  const yFor = (value: number) => plot.bottom - value / model.yMaximum * plotHeight
  const colorIndexFor = (id: string) => entries.find(({ id: entryId }) => entryId === id)?.colorIndex ?? 0
  const lineColor = (id: string) => scenarioColor(colorIndexFor(id))
  const money = (value: number, maximumFractionDigits = 6) => formatMoney(value, currency, usdToCny, maximumFractionDigits)

  function updateFromPointer(event: ReactPointerEvent<Element>) {
    const svg = svgRef.current
    if (!svg) return
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const matrix = svg.getScreenCTM()
    if (!matrix) return
    const localPoint = point.matrixTransform(matrix.inverse())
    const fraction = Math.min(1, Math.max(0, (localPoint.x - plot.left) / plotWidth))
    onCursorFractionChange(fraction)
  }

  function updateFromDrag(event: ReactPointerEvent<Element>) {
    if (event.buttons !== 0) updateFromPointer(event)
  }

  function closestCostAtIntersection(entry: ChartEntry): CostBreakdown | null {
    if (!visibleIntersection) return null
    return calculateCost(inputAtAxis(entry.input, axis, visibleIntersection.axisValue))
  }

  const intersectionRows: Array<ChartEntry & { colorIndex: number; cost: CostBreakdown | null }> = entries.map((entry) => ({
    ...entry,
    cost: closestCostAtIntersection(entry),
  }))
  const axisName = axis === 'cacheHitPercent' ? '缓存命中率' : axis === 'inputTokensM' ? '输入 Token 数' : '输出输入比例'
  const crossingAxisName = axis === 'cacheHitPercent' ? '缓存命中率' : axis === 'inputTokensM' ? '输入 Token' : '输出 / 输入比'

  return (
    <section className="mt-section rounded-panel border border-line bg-surface px-panel pb-panel pt-panel shadow-panel max-phone:mt-3 max-phone:px-3.5 max-phone:pb-4 max-phone:pt-5" aria-labelledby="chart-title">
      <div className="mb-5 flex items-end justify-between gap-4 max-phone:mb-4 max-phone:flex-col max-phone:items-start max-phone:gap-3">
        <div>
          <p className="m-0 mb-2 font-mono text-meta tracking-eyebrow text-muted">方案分析</p>
          <h2 id="chart-title" className="m-0 text-title">成本变化</h2>
          <p className="m-0 mt-1.5 text-label text-muted max-phone:text-meta">比较请求用量变化时的成本；点选交点查看对应参数。</p>
        </div>
        {cheapestAtCursor && (
          <div className="flex flex-col items-end gap-1.5 whitespace-nowrap text-meta text-quiet max-phone:items-start max-phone:gap-1">
            <span>当前 {axisLabel(axis, model.cursorValue)}</span>
            <strong className="flex items-center gap-1.5 text-label font-bold text-ink">
              <i className={`inline-flex size-2 shrink-0 rounded-full ${scenarioSwatchClass(colorIndexFor(cheapestAtCursor.id))}`} />
              {cheapestAtCursor.name} 更省
            </strong>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-x-gutter gap-y-5 rounded-inset border border-line-soft bg-surface-alt px-4 py-3.5 max-phone:grid max-phone:gap-3.5 max-phone:px-2.5 max-phone:py-3">
        <div className="grid gap-2 max-phone:gap-1.5">
          <span className="text-meta font-bold text-muted">横轴参数</span>
          <div className="flex flex-wrap gap-1.5 max-phone:gap-1" role="group" aria-label="横轴参数">
            {AXIS_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={segmentClass(axis === option.value)}
                type="button"
                aria-pressed={axis === option.value}
                onClick={() => onAxisChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 max-phone:gap-1.5">
          <span className="text-meta font-bold text-muted">纵轴成本</span>
          <div className="flex flex-wrap gap-1.5 max-phone:gap-1" role="group" aria-label="纵轴成本">
            {METRIC_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={segmentClass(metric === option.value)}
                type="button"
                aria-pressed={metric === option.value}
                onClick={() => onMetricChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="px-1 max-phone:-mx-1">
          <svg
            ref={svgRef}
            className="cost-chart h-auto w-full overflow-visible touch-manipulation"
            viewBox="0 0 920 430"
            role="group"
            aria-label={`${metricLabel(metric)}随${axisName}变化的对比图`}
            onPointerMove={updateFromDrag}
          >
            <g className="chart-grid">
              {yTicks.map((tick, index) => (
                <Fragment key={`y-${index}`}>
                  <line x1={plot.left} x2={plot.right} y1={yFor(tick)} y2={yFor(tick)} />
                  <text x={plot.left - 14} y={yFor(tick) + 5} textAnchor="end">{money(tick, yFractionDigits)}</text>
                </Fragment>
              ))}
              {X_FRACTIONS.map((fraction) => (
                <Fragment key={`x-${fraction}`}>
                  <line className="vertical-grid" x1={xFor(fraction)} x2={xFor(fraction)} y1={plot.top} y2={plot.bottom} />
                  <text x={xFor(fraction)} y={plot.bottom + 30} textAnchor="middle">{axisLabel(axis, model.axisMaximum * fraction)}</text>
                </Fragment>
              ))}
            </g>

            <rect
              className="plot-hit-area"
              x={plot.left}
              y={plot.top}
              width={plotWidth}
              height={plotHeight}
              onPointerDown={(event) => {
                event.preventDefault()
                updateFromPointer(event)
              }}
            />

            <line className="cursor-line" x1={xFor(model.cursorFraction)} x2={xFor(model.cursorFraction)} y1={plot.top} y2={plot.bottom} />
            {model.lines.map((line) => (
              <g key={line.id} className="chart-series" style={{ color: lineColor(line.id) }}>
                <line x1={plot.left} y1={yFor(line.startCost)} x2={plot.right} y2={yFor(line.endCost)} />
                <circle cx={xFor(model.cursorFraction)} cy={yFor(line.cursorCost)} r={5} />
              </g>
            ))}

            {model.intersections.map((intersection) => (
              <g
                key={intersection.key}
                className={selectedKey === intersection.key ? 'intersection-marker is-selected' : 'intersection-marker'}
                role="button"
                tabIndex={0}
                aria-label={`${intersection.firstName} 和 ${intersection.secondName} 在 ${axisLabel(axis, intersection.axisValue)} 时成本相交，${money(intersection.cost)}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectIntersection(intersection.key)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onSelectIntersection(intersection.key)
                }}
              >
                <circle className="marker-halo" cx={xFor(intersection.fraction)} cy={yFor(intersection.cost)} r={12} />
                <circle className="marker-core" cx={xFor(intersection.fraction)} cy={yFor(intersection.cost)} r={6} />
              </g>
            ))}

            <g className="chart-axis">
              <line x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} />
              <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
            </g>
          </svg>
          <label className="mx-1 mt-1.5 flex items-center gap-3 text-meta text-muted max-phone:mx-0 max-phone:gap-1.5 max-phone:text-micro">
            <span className="shrink-0">拖动查看</span>
            <input
              className="min-w-0 flex-1 accent-primary"
              type="range"
              min="0"
              max="1000"
              step="1"
              value={Math.round(cursorFraction * 1000)}
              aria-label={`图表横轴位置，当前 ${axisLabel(axis, model.cursorValue)}`}
              onChange={(event) => onCursorFractionChange(Number(event.target.value) / 1000)}
            />
            <output className="scrub-readout shrink-0 text-right font-mono text-primary-deep">{axisLabel(axis, model.cursorValue)}</output>
          </label>
          <div className="mx-1.5 mt-3.5 mb-1 flex flex-wrap gap-x-5 gap-y-2.5 rounded-control bg-surface-alt px-3.5 py-3 max-phone:mx-1 max-phone:gap-x-3.5 max-phone:gap-y-2 max-phone:p-2.5" aria-label="方案图例">
            {model.lines.map((line) => (
              <span key={line.id} className="inline-flex items-center gap-1.5 text-meta text-ink max-phone:gap-1 max-phone:text-micro">
                <i className={`inline-flex size-2 shrink-0 rounded-full ${scenarioSwatchClass(colorIndexFor(line.id))}`} />
                {line.name} <strong className="font-mono text-meta font-medium text-ink max-phone:text-micro">{money(line.cursorCost)}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="chart-placeholder flex flex-col items-center justify-center gap-3 text-center text-muted" role="status">
          <span className="flex size-control items-center justify-center rounded-inset border border-dashed border-quiet text-symbol text-muted">—</span>
          <p className="m-0 max-w-summary text-ui">添加并完善至少一个有效方案，成本曲线会显示在这里。</p>
        </div>
      )}

      {entries.length > 0 && model.intersections.length > 0 ? (
        <div className="mt-panel border-t border-line-soft pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="m-0 mb-1 font-mono text-meta tracking-eyebrow text-muted">方案交点</p>
              <h3 className="m-0 text-heading">成本交叉点</h3>
            </div>
            <span className="rounded-badge bg-surface-alt px-1.5 py-1 font-mono text-micro text-muted">{model.intersections.length} 个</span>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2" role="group" aria-label="选择成本交叉点">
            {model.intersections.map((intersection) => (
              <button
                key={intersection.key}
                className={selectedKey === intersection.key
                  ? 'inline-flex min-h-control cursor-pointer items-center gap-2 rounded-control border border-primary bg-primary-soft px-2.5 text-meta text-primary-deep'
                  : 'inline-flex min-h-control cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-meta text-ink'}
                type="button"
                aria-pressed={selectedKey === intersection.key}
                onClick={() => onSelectIntersection(intersection.key)}
              >
                <span>{intersection.firstName} × {intersection.secondName}</span>
                <strong className="font-mono text-meta font-medium">{axisLabel(axis, intersection.axisValue)}</strong>
                <small className="font-mono text-micro text-muted">{money(intersection.cost)}</small>
              </button>
            ))}
          </div>
          {!visibleIntersection && <p className="m-0 mt-3.5 text-label text-muted">点选图上的交点，查看该参数下的方案明细。</p>}
          {visibleIntersection && (
            <>
              <div className="mt-3 flex flex-wrap gap-x-control gap-y-section rounded-control bg-surface-alt px-4 py-3.5 max-phone:gap-x-5 max-phone:gap-y-3 max-phone:p-2.5">
                <div className="grid gap-1">
                  <span className="text-micro text-muted">{crossingAxisName}</span>
                  <strong className="font-mono text-value font-medium text-primary-deep max-phone:text-label">{axisLabel(axis, visibleIntersection.axisValue)}</strong>
                </div>
                <div className="grid gap-1">
                  <span className="text-micro text-muted">{visibleIntersection.firstName} 与 {visibleIntersection.secondName}</span>
                  <strong className="font-mono text-value font-medium text-primary-deep max-phone:text-label">{money(visibleIntersection.cost)} · {metricLabel(metric)}</strong>
                </div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse whitespace-nowrap text-left">
                  <thead>
                    <tr>
                      <th className="border-b border-line px-2.5 py-2 text-micro font-semibold text-muted max-phone:px-1.5 max-phone:py-2">方案</th>
                      <th className="border-b border-line px-2.5 py-2 text-micro font-semibold text-muted max-phone:px-1.5 max-phone:py-2">输入</th>
                      <th className="border-b border-line px-2.5 py-2 text-micro font-semibold text-muted max-phone:px-1.5 max-phone:py-2">缓存命中</th>
                      <th className="border-b border-line px-2.5 py-2 text-micro font-semibold text-muted max-phone:px-1.5 max-phone:py-2">输出比</th>
                      <th className="border-b border-line px-2.5 py-2 text-micro font-semibold text-muted max-phone:px-1.5 max-phone:py-2">总成本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intersectionRows.map((entry) => (
                      <tr key={entry.id}>
                        <td className="border-b border-line-soft px-2.5 py-2.5 text-meta font-bold text-ink max-phone:px-1.5 max-phone:py-2"><i className={`mr-1.5 inline-flex size-1.5 shrink-0 rounded-full align-middle ${scenarioSwatchClass(entry.colorIndex)}`} />{entry.name}</td>
                        <td className="border-b border-line-soft px-2.5 py-2.5 font-mono text-meta text-ink max-phone:px-1.5 max-phone:py-2">{formatNumber((entry.cost?.inputTokens ?? 0) / 1_000_000)}M</td>
                        <td className="border-b border-line-soft px-2.5 py-2.5 font-mono text-meta text-ink max-phone:px-1.5 max-phone:py-2">{formatNumber((entry.cost?.cachedTokens ?? 0) / Math.max(entry.cost?.inputTokens ?? 1, 1) * 100, 4)}%</td>
                        <td className="border-b border-line-soft px-2.5 py-2.5 font-mono text-meta text-ink max-phone:px-1.5 max-phone:py-2">{formatNumber((entry.cost?.outputTokens ?? 0) / Math.max(entry.cost?.inputTokens ?? 1, 1) * 100, 3)}%</td>
                        <td className="border-b border-line-soft px-2.5 py-2.5 font-mono text-meta text-ink max-phone:px-1.5 max-phone:py-2">{entry.cost ? money(entry.cost.totalCost) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        entries.length > 0 && <p className="m-0 mt-3.5 text-label text-muted">当前方案在这个参数范围内没有成本交叉点。</p>
      )}
    </section>
  )
}
