<script setup lang="ts">
import { computed, ref } from 'vue'
import { calculateCost, formatNumber } from '../domain/cost'
import { formatMoney } from '../domain/currency'
import type { CurrencyCode } from '../domain/currency'
import type { CostBreakdown } from '../domain/cost'
import { axisLabel, buildChartModel, inputAtAxis, metricLabel } from '../domain/chart'
import type { ChartAxis, ChartEntry, CostMetric } from '../domain/chart'

const props = defineProps<{
  entries: Array<ChartEntry & { colorIndex: number }>
  axis: ChartAxis
  metric: CostMetric
  cursorFraction: number
  selectedKey: string | null
  currency: CurrencyCode
  usdToCny: number
}>()

const emit = defineEmits<{
  'update:axis': [axis: ChartAxis]
  'update:metric': [metric: CostMetric]
  'update:cursorFraction': [fraction: number]
  'select-intersection': [key: string]
}>()

const svgRef = ref<SVGSVGElement | null>(null)
const plot = { left: 86, top: 32, right: 890, bottom: 362 }
const plotWidth = plot.right - plot.left
const plotHeight = plot.bottom - plot.top
const model = computed(() => buildChartModel(props.entries, props.axis, props.metric, props.cursorFraction))
const yTicks = computed(() => Array.from({ length: 5 }, (_, index) => model.value.yMaximum * index / 4))
const yFractionDigits = computed(() => model.value.yMaximum < 0.01 ? 6 : model.value.yMaximum < 1 ? 4 : model.value.yMaximum < 100 ? 3 : 2)
const visibleIntersection = computed(() => model.value.intersections.find(({ key }) => key === props.selectedKey) ?? null)
const cheapestAtCursor = computed(() => model.value.cursorCosts.find(({ id }) => id === model.value.lowestCostId) ?? null)

function xFor(fraction: number): number {
  return plot.left + fraction * plotWidth
}

function yFor(value: number): number {
  return plot.bottom - value / model.value.yMaximum * plotHeight
}

function colorIndexFor(id: string): number {
  return props.entries.find(({ id: entryId }) => entryId === id)?.colorIndex ?? 0
}

function lineColor(id: string): string {
  return `var(--scenario-${colorIndexFor(id) % 16})`
}

function updateFromPointer(event: PointerEvent) {
  const svg = svgRef.value
  if (!svg) return
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const matrix = svg.getScreenCTM()
  if (!matrix) return
  const localPoint = point.matrixTransform(matrix.inverse())
  const fraction = Math.min(1, Math.max(0, (localPoint.x - plot.left) / plotWidth))
  emit('update:cursorFraction', fraction)
}

function updateFromDrag(event: PointerEvent) {
  if (event.buttons !== 0) updateFromPointer(event)
}

function closestCostAtIntersection(entry: ChartEntry): CostBreakdown | null {
  if (!visibleIntersection.value) return null
  return calculateCost(inputAtAxis(entry.input, props.axis, visibleIntersection.value.axisValue))
}

function money(value: number, maximumFractionDigits = 6): string {
  return formatMoney(value, props.currency, props.usdToCny, maximumFractionDigits)
}

const intersectionRows = computed(() => props.entries.map((entry) => ({
  ...entry,
  cost: closestCostAtIntersection(entry),
})))

</script>

<template>
  <section class="chart-panel" aria-labelledby="chart-title">
    <div class="section-heading chart-heading">
      <div>
        <p class="eyebrow">方案分析</p>
        <h2 id="chart-title">成本变化</h2>
        <p class="section-hint">比较请求用量变化时的成本；点选交点查看对应参数。</p>
      </div>
      <div v-if="cheapestAtCursor" class="cursor-estimate">
        <span>当前 {{ axisLabel(axis, model.cursorValue) }}</span>
          <strong><i class="scenario-swatch" :class="`swatch-${colorIndexFor(cheapestAtCursor.id) % 16}`" />{{ cheapestAtCursor.name }} 更省</strong>
      </div>
    </div>

    <div class="chart-options">
      <div class="control-group">
        <span class="control-label">横轴参数</span>
        <div class="segmented-control" role="group" aria-label="横轴参数">
          <button v-for="option in [
            { value: 'cacheHitPercent', label: '缓存命中率' },
            { value: 'inputTokensM', label: '输入 Token' },
            { value: 'outputRatioPercent', label: '输出 / 输入比' },
          ]" :key="option.value" type="button" :aria-pressed="axis === option.value" @click="emit('update:axis', option.value as ChartAxis)">
            {{ option.label }}
          </button>
        </div>
      </div>
      <div class="control-group">
        <span class="control-label">纵轴成本</span>
        <div class="segmented-control compact-control" role="group" aria-label="纵轴成本">
          <button v-for="option in [
            { value: 'total', label: '总成本' },
            { value: 'input', label: '输入' },
            { value: 'output', label: '输出' },
          ]" :key="option.value" type="button" :aria-pressed="metric === option.value" @click="emit('update:metric', option.value as CostMetric)">
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="entries.length" class="chart-frame">
      <svg
        ref="svgRef"
        class="cost-chart"
        viewBox="0 0 920 430"
        role="group"
        :aria-label="`${metricLabel(metric)}随${axis === 'cacheHitPercent' ? '缓存命中率' : axis === 'inputTokensM' ? '输入 Token 数' : '输出输入比例'}变化的对比图`"
        @pointermove="updateFromDrag"
      >
        <g class="chart-grid">
          <template v-for="(tick, index) in yTicks" :key="`y-${index}`">
            <line :x1="plot.left" :x2="plot.right" :y1="yFor(tick)" :y2="yFor(tick)" />
            <text :x="plot.left - 14" :y="yFor(tick) + 5" text-anchor="end">{{ money(tick, yFractionDigits) }}</text>
          </template>
          <template v-for="fraction in [0, 0.25, 0.5, 0.75, 1]" :key="`x-${fraction}`">
            <line class="vertical-grid" :x1="xFor(fraction)" :x2="xFor(fraction)" :y1="plot.top" :y2="plot.bottom" />
            <text :x="xFor(fraction)" :y="plot.bottom + 30" text-anchor="middle">{{ axisLabel(axis, model.axisMaximum * fraction) }}</text>
          </template>
        </g>

        <rect
          class="plot-hit-area"
          :x="plot.left"
          :y="plot.top"
          :width="plotWidth"
          :height="plotHeight"
          @pointerdown.prevent="updateFromPointer"
        />

        <line class="cursor-line" :x1="xFor(model.cursorFraction)" :x2="xFor(model.cursorFraction)" :y1="plot.top" :y2="plot.bottom" />
        <g v-for="line in model.lines" :key="line.id" class="chart-series" :style="{ color: lineColor(line.id) }">
          <line :x1="plot.left" :y1="yFor(line.startCost)" :x2="plot.right" :y2="yFor(line.endCost)" />
          <circle :cx="xFor(model.cursorFraction)" :cy="yFor(line.cursorCost)" r="5" />
        </g>

        <g
          v-for="intersection in model.intersections"
          :key="intersection.key"
          class="intersection-marker"
          :class="{ 'is-selected': selectedKey === intersection.key }"
          role="button"
          tabindex="0"
          :aria-label="`${intersection.firstName} 和 ${intersection.secondName} 在 ${axisLabel(axis, intersection.axisValue)} 时成本相交，${money(intersection.cost)}`"
          @pointerdown.stop
          @click.stop="emit('select-intersection', intersection.key)"
          @keydown.enter.prevent="emit('select-intersection', intersection.key)"
          @keydown.space.prevent="emit('select-intersection', intersection.key)"
        >
          <circle class="marker-halo" :cx="xFor(intersection.fraction)" :cy="yFor(intersection.cost)" r="12" />
          <circle class="marker-core" :cx="xFor(intersection.fraction)" :cy="yFor(intersection.cost)" r="6" />
        </g>

        <g class="chart-axis">
          <line :x1="plot.left" :x2="plot.left" :y1="plot.top" :y2="plot.bottom" />
          <line :x1="plot.left" :x2="plot.right" :y1="plot.bottom" :y2="plot.bottom" />
        </g>
      </svg>
      <label class="chart-scrubber">
        <span>拖动查看</span>
        <input
          type="range"
          min="0"
          max="1000"
          step="1"
          :value="Math.round(cursorFraction * 1000)"
          :aria-label="`图表横轴位置，当前 ${axisLabel(axis, model.cursorValue)}`"
          @input="emit('update:cursorFraction', Number(($event.target as HTMLInputElement).value) / 1000)"
        >
        <output>{{ axisLabel(axis, model.cursorValue) }}</output>
      </label>
      <div class="chart-legend" aria-label="方案图例">
        <span v-for="line in model.lines" :key="line.id">
          <i class="scenario-swatch" :class="`swatch-${colorIndexFor(line.id) % 16}`" />
          {{ line.name }} <strong>{{ money(line.cursorCost) }}</strong>
        </span>
      </div>
    </div>
    <div v-else class="chart-empty" role="status">
      <span>—</span>
      <p>添加并完善至少一个有效方案，成本曲线会显示在这里。</p>
    </div>

    <div v-if="entries.length && model.intersections.length" class="intersection-section">
      <div class="intersection-heading">
        <div>
          <p class="eyebrow">方案交点</p>
          <h3>成本交叉点</h3>
        </div>
        <span class="intersection-count">{{ model.intersections.length }} 个</span>
      </div>
      <div class="intersection-picker" role="group" aria-label="选择成本交叉点">
        <button
          v-for="intersection in model.intersections"
          :key="intersection.key"
          type="button"
          :aria-pressed="selectedKey === intersection.key"
          @click="emit('select-intersection', intersection.key)"
        >
          <span>{{ intersection.firstName }} × {{ intersection.secondName }}</span>
          <strong>{{ axisLabel(axis, intersection.axisValue) }}</strong>
          <small>{{ money(intersection.cost) }}</small>
        </button>
      </div>
      <p v-if="!visibleIntersection" class="intersection-prompt">点选图上的交点，查看该参数下的方案明细。</p>
      <template v-else>
        <div class="crossing-summary">
          <div>
            <span>{{ axis === 'cacheHitPercent' ? '缓存命中率' : axis === 'inputTokensM' ? '输入 Token' : '输出 / 输入比' }}</span>
            <strong>{{ axisLabel(axis, visibleIntersection.axisValue) }}</strong>
          </div>
          <div>
            <span>{{ visibleIntersection.firstName }} 与 {{ visibleIntersection.secondName }}</span>
            <strong>{{ money(visibleIntersection.cost) }} · {{ metricLabel(metric) }}</strong>
          </div>
        </div>
        <div class="crossing-table-wrap">
          <table class="crossing-table">
            <thead>
              <tr><th>方案</th><th>输入</th><th>缓存命中</th><th>输出比</th><th>总成本</th></tr>
            </thead>
            <tbody>
              <tr v-for="entry in intersectionRows" :key="entry.id">
                <td><i class="scenario-swatch" :class="`swatch-${entry.colorIndex % 16}`" />{{ entry.name }}</td>
                <td>{{ formatNumber((entry.cost?.inputTokens ?? 0) / 1_000_000) }}M</td>
                <td>{{ formatNumber((entry.cost?.cachedTokens ?? 0) / Math.max(entry.cost?.inputTokens ?? 1, 1) * 100, 4) }}%</td>
                <td>{{ formatNumber((entry.cost?.outputTokens ?? 0) / Math.max(entry.cost?.inputTokens ?? 1, 1) * 100, 3) }}%</td>
                <td>{{ entry.cost ? money(entry.cost.totalCost) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
    <p v-else-if="entries.length" class="no-crossing">当前方案在这个参数范围内没有成本交叉点。</p>
  </section>
</template>
