import { calculateCost } from './cost'
import type { CalculationInput, CostBreakdown } from './cost'

export type ChartAxis = 'cacheHitPercent' | 'inputTokensM' | 'outputRatioPercent'
export type CostMetric = 'total' | 'input' | 'output'

export type ChartEntry = Readonly<{
  id: string
  name: string
  input: CalculationInput
}>

export type ChartLine = Readonly<{
  id: string
  name: string
  startCost: number
  endCost: number
  cursorCost: number
}>

export type ChartIntersection = Readonly<{
  key: string
  firstId: string
  secondId: string
  firstName: string
  secondName: string
  fraction: number
  axisValue: number
  cost: number
}>

export type ChartModel = Readonly<{
  axis: ChartAxis
  metric: CostMetric
  axisMaximum: number
  cursorFraction: number
  cursorValue: number
  yMaximum: number
  lines: ChartLine[]
  intersections: ChartIntersection[]
  cursorCosts: Array<{ id: string; name: string; cost: number }>
  lowestCostId: string | null
}>

function costFor(input: CalculationInput, axis: ChartAxis, value: number): CostBreakdown {
  return calculateCost(inputAtAxis(input, axis, value))
}

export function inputAtAxis(input: CalculationInput, axis: ChartAxis, value: number): CalculationInput {
  switch (axis) {
    case 'cacheHitPercent':
      return { ...input, cacheHitRate: value / 100 }
    case 'inputTokensM':
      return { ...input, inputTokens: value * 1_000_000 }
    case 'outputRatioPercent':
      return { ...input, outputInputRatio: value / 100 }
  }
}

function metricValue(cost: CostBreakdown, metric: CostMetric): number {
  switch (metric) {
    case 'input': return cost.inputCost
    case 'output': return cost.outputCost
    case 'total': return cost.totalCost
  }
}

function axisRange(entries: readonly ChartEntry[], axis: ChartAxis): number {
  if (axis === 'cacheHitPercent') return 100
  if (axis === 'inputTokensM') {
    return Math.max(1, ...entries.map(({ input }) => input.inputTokens / 1_000_000)) * 1.2
  }
  return Math.max(1, ...entries.map(({ input }) => input.outputInputRatio * 100)) * 1.5
}

function niceMaximum(value: number): number {
  if (value <= 0 || !Number.isFinite(value)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

export function buildChartModel(
  entries: readonly ChartEntry[],
  axis: ChartAxis,
  metric: CostMetric,
  cursorFraction: number,
): ChartModel {
  const axisMaximum = axisRange(entries, axis)
  const fraction = Math.min(1, Math.max(0, cursorFraction))
  const cursorValue = axisMaximum * fraction
  const lines: ChartLine[] = entries.map(({ id, name, input }) => ({
    id,
    name,
    startCost: metricValue(costFor(input, axis, 0), metric),
    endCost: metricValue(costFor(input, axis, axisMaximum), metric),
    cursorCost: metricValue(costFor(input, axis, cursorValue), metric),
  }))

  const intersections: ChartIntersection[] = []
  for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
      const first = lines[firstIndex]
      const second = lines[secondIndex]
      const firstSlope = first.endCost - first.startCost
      const secondSlope = second.endCost - second.startCost
      const denominator = firstSlope - secondSlope
      if (Math.abs(denominator) < 1e-12) continue

      const crossingFraction = (second.startCost - first.startCost) / denominator
      if (crossingFraction <= 0 || crossingFraction >= 1) continue

      const cost = first.startCost + firstSlope * crossingFraction
      intersections.push({
        key: `${first.id}:${second.id}`,
        firstId: first.id,
        secondId: second.id,
        firstName: first.name,
        secondName: second.name,
        fraction: crossingFraction,
        axisValue: crossingFraction * axisMaximum,
        cost,
      })
    }
  }

  const cursorCosts = lines.map(({ id, name, cursorCost }) => ({ id, name, cost: cursorCost }))
  const lowestCost = cursorCosts.reduce<(typeof cursorCosts)[number] | null>(
    (lowest, candidate) => lowest === null || candidate.cost < lowest.cost ? candidate : lowest,
    null,
  )
  const yMaximum = niceMaximum(Math.max(0, ...lines.flatMap(({ startCost, endCost }) => [startCost, endCost])))

  return {
    axis,
    metric,
    axisMaximum,
    cursorFraction: fraction,
    cursorValue,
    yMaximum,
    lines,
    intersections,
    cursorCosts,
    lowestCostId: lowestCost?.id ?? null,
  }
}

export function axisLabel(axis: ChartAxis, value: number): string {
  const amount = Math.abs(value)
  const fractionDigits = amount > 0 && amount < 0.01 ? 6 : amount > 0 && amount < 1 ? 4 : 2
  switch (axis) {
    case 'cacheHitPercent':
    case 'outputRatioPercent':
      return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: fractionDigits }).format(value)}%`
    case 'inputTokensM':
      return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: fractionDigits }).format(value)}M`
  }
}

export function metricLabel(metric: CostMetric): string {
  switch (metric) {
    case 'input': return '输入成本'
    case 'output': return '输出成本'
    case 'total': return '总成本'
  }
}
