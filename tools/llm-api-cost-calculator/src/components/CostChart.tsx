import { Fragment, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { calculateCost, formatNumber } from '../domain/cost'
import type { CostBreakdown } from '../domain/cost'
import { formatMoney } from '../domain/currency'
import type { CurrencyCode } from '../domain/currency'
import { axisLabel, buildChartModel, inputAtAxis, metricLabel } from '../domain/chart'
import type { ChartAxis, ChartEntry, CostMetric } from '../domain/chart'

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
  const lineColor = (id: string) => `var(--scenario-${colorIndexFor(id) % 16})`
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
    <section className="chart-panel" aria-labelledby="chart-title">
      <div className="section-heading chart-heading">
        <div>
          <p className="eyebrow">方案分析</p>
          <h2 id="chart-title">成本变化</h2>
          <p className="section-hint">比较请求用量变化时的成本；点选交点查看对应参数。</p>
        </div>
        {cheapestAtCursor && (
          <div className="cursor-estimate">
            <span>当前 {axisLabel(axis, model.cursorValue)}</span>
            <strong><i className={`scenario-swatch swatch-${colorIndexFor(cheapestAtCursor.id) % 16}`} />{cheapestAtCursor.name} 更省</strong>
          </div>
        )}
      </div>

      <div className="chart-options">
        <div className="control-group">
          <span className="control-label">横轴参数</span>
          <div className="segmented-control" role="group" aria-label="横轴参数">
            {AXIS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={axis === option.value}
                onClick={() => onAxisChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="control-group">
          <span className="control-label">纵轴成本</span>
          <div className="segmented-control compact-control" role="group" aria-label="纵轴成本">
            {METRIC_OPTIONS.map((option) => (
              <button
                key={option.value}
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
        <div className="chart-frame">
          <svg
            ref={svgRef}
            className="cost-chart"
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
          <label className="chart-scrubber">
            <span>拖动查看</span>
            <input
              type="range"
              min="0"
              max="1000"
              step="1"
              value={Math.round(cursorFraction * 1000)}
              aria-label={`图表横轴位置，当前 ${axisLabel(axis, model.cursorValue)}`}
              onChange={(event) => onCursorFractionChange(Number(event.target.value) / 1000)}
            />
            <output>{axisLabel(axis, model.cursorValue)}</output>
          </label>
          <div className="chart-legend" aria-label="方案图例">
            {model.lines.map((line) => (
              <span key={line.id}>
                <i className={`scenario-swatch swatch-${colorIndexFor(line.id) % 16}`} />
                {' '}{line.name} <strong>{money(line.cursorCost)}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="chart-empty" role="status">
          <span>—</span>
          <p>添加并完善至少一个有效方案，成本曲线会显示在这里。</p>
        </div>
      )}

      {entries.length > 0 && model.intersections.length > 0 ? (
        <div className="intersection-section">
          <div className="intersection-heading">
            <div>
              <p className="eyebrow">方案交点</p>
              <h3>成本交叉点</h3>
            </div>
            <span className="intersection-count">{model.intersections.length} 个</span>
          </div>
          <div className="intersection-picker" role="group" aria-label="选择成本交叉点">
            {model.intersections.map((intersection) => (
              <button
                key={intersection.key}
                type="button"
                aria-pressed={selectedKey === intersection.key}
                onClick={() => onSelectIntersection(intersection.key)}
              >
                <span>{intersection.firstName} × {intersection.secondName}</span>
                <strong>{axisLabel(axis, intersection.axisValue)}</strong>
                <small>{money(intersection.cost)}</small>
              </button>
            ))}
          </div>
          {!visibleIntersection && <p className="intersection-prompt">点选图上的交点，查看该参数下的方案明细。</p>}
          {visibleIntersection && (
            <>
              <div className="crossing-summary">
                <div>
                  <span>{crossingAxisName}</span>
                  <strong>{axisLabel(axis, visibleIntersection.axisValue)}</strong>
                </div>
                <div>
                  <span>{visibleIntersection.firstName} 与 {visibleIntersection.secondName}</span>
                  <strong>{money(visibleIntersection.cost)} · {metricLabel(metric)}</strong>
                </div>
              </div>
              <div className="crossing-table-wrap">
                <table className="crossing-table">
                  <thead>
                    <tr><th>方案</th><th>输入</th><th>缓存命中</th><th>输出比</th><th>总成本</th></tr>
                  </thead>
                  <tbody>
                    {intersectionRows.map((entry) => (
                      <tr key={entry.id}>
                        <td><i className={`scenario-swatch swatch-${entry.colorIndex % 16}`} />{entry.name}</td>
                        <td>{formatNumber((entry.cost?.inputTokens ?? 0) / 1_000_000)}M</td>
                        <td>{formatNumber((entry.cost?.cachedTokens ?? 0) / Math.max(entry.cost?.inputTokens ?? 1, 1) * 100, 4)}%</td>
                        <td>{formatNumber((entry.cost?.outputTokens ?? 0) / Math.max(entry.cost?.inputTokens ?? 1, 1) * 100, 3)}%</td>
                        <td>{entry.cost ? money(entry.cost.totalCost) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        entries.length > 0 && <p className="no-crossing">当前方案在这个参数范围内没有成本交叉点。</p>
      )}
    </section>
  )
}
