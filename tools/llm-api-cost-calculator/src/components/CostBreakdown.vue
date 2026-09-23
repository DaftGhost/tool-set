<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney, formatNumber } from '../domain/cost'
import type { CostBreakdown } from '../domain/cost'

const props = defineProps<{ result: CostBreakdown | null }>()
const total = computed(() => props.result?.totalCost ?? 0)
const pieces = computed(() => {
  if (!props.result || total.value === 0) return [
    { key: 'cached', label: '缓存输入', color: 'cached', width: 0 },
    { key: 'uncached', label: '未缓存输入', color: 'uncached', width: 0 },
    { key: 'output', label: '输出', color: 'output', width: 0 },
  ]
  return [
    { key: 'cached', label: '缓存输入', color: 'cached', width: props.result.cachedCost / total.value * 100 },
    { key: 'uncached', label: '未缓存输入', color: 'uncached', width: props.result.uncachedCost / total.value * 100 },
    { key: 'output', label: '输出', color: 'output', width: props.result.outputCost / total.value * 100 },
  ]
})
</script>

<template>
  <section class="summary-card" aria-labelledby="summary-title">
    <div class="summary-topline">
      <div>
        <p class="eyebrow">估算 · 单次请求</p>
        <h2 id="summary-title">成本拆分</h2>
      </div>
      <span class="summary-scope">元 / 请求</span>
    </div>

    <div v-if="result" class="summary-content">
      <div class="total-display">
        <span>预估总成本</span>
        <strong>{{ formatMoney(result.totalCost) }}</strong>
      </div>

      <div class="cost-rail" role="img" :aria-label="`缓存输入 ${formatMoney(result.cachedCost)}，未缓存输入 ${formatMoney(result.uncachedCost)}，输出 ${formatMoney(result.outputCost)}`">
        <span
          v-for="piece in pieces"
          :key="piece.key"
          :class="`rail-${piece.color}`"
          :style="{ width: `${piece.width}%` }"
        />
      </div>

      <div class="cost-lines">
        <div class="cost-line">
          <span class="line-dot dot-input" />
          <div class="line-copy">
            <span class="line-title">输入成本</span>
            <small>{{ formatNumber(result.inputTokens / 1_000_000) }}M tokens</small>
          </div>
          <strong>{{ formatMoney(result.inputCost) }}</strong>
        </div>
        <div class="cost-line cost-subline">
          <span class="line-dot dot-cached" />
          <div class="line-copy">
            <span class="line-title">缓存命中</span>
            <small>{{ formatNumber(result.cachedTokens / 1_000_000) }}M tokens</small>
          </div>
          <strong>{{ formatMoney(result.cachedCost) }}</strong>
        </div>
        <div class="cost-line cost-subline">
          <span class="line-dot dot-uncached" />
          <div class="line-copy">
            <span class="line-title">未缓存输入</span>
            <small>{{ formatNumber(result.uncachedTokens / 1_000_000) }}M tokens</small>
          </div>
          <strong>{{ formatMoney(result.uncachedCost) }}</strong>
        </div>
        <div class="cost-line">
          <span class="line-dot dot-output" />
          <div class="line-copy">
            <span class="line-title">输出成本</span>
            <small>{{ formatNumber(result.outputTokens / 1_000_000) }}M tokens</small>
          </div>
          <strong>{{ formatMoney(result.outputCost) }}</strong>
        </div>
      </div>

      <p class="summary-footnote">按当前单价估算；实际账单可能因供应商计费规则而异。</p>
    </div>

    <div v-else class="summary-invalid" role="status">
      <span class="invalid-mark">!</span>
      <p>完善左侧参数后，这里会显示成本拆分。</p>
    </div>
  </section>
</template>
