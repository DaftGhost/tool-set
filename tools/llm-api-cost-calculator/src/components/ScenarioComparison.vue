<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney } from '../domain/currency'
import type { CurrencyCode } from '../domain/currency'
import type { ScenarioDraft, CostBreakdown } from '../domain/cost'

export type ComparisonRow = {
  draft: ScenarioDraft
  result: CostBreakdown | null
  errors: Record<string, string>
}

const props = defineProps<{
  rows: ComparisonRow[]
  activeId: string
  limitReached: boolean
  currency: CurrencyCode
  usdToCny: number
}>()

const cheapestId = computed(() => {
  const priced = props.rows.filter(({ result }) => result !== null)
  if (priced.length < 2) return null
  return priced.reduce((best, candidate) => candidate.result!.totalCost < best.result!.totalCost ? candidate : best).draft.id
})

const emit = defineEmits<{
  select: [id: string]
  remove: [id: string]
  add: []
}>()

function scenarioName(name: string): string {
  return name.trim() || '未命名方案'
}
</script>

<template>
  <section class="comparison-panel" aria-labelledby="comparison-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">测算对象</p>
        <h2 id="comparison-title">方案</h2>
        <p class="section-hint">选择要编辑的方案，成本会随参数变化。</p>
      </div>
      <button class="button button-soft add-scenario" type="button" :disabled="limitReached" @click="emit('add')">
        <span aria-hidden="true">＋</span> 添加方案
      </button>
    </div>

    <p v-if="limitReached" class="limit-note">最多比较 16 个方案。</p>

    <div class="scenario-grid">
      <article
        v-for="(row, index) in rows"
        :key="row.draft.id"
        class="scenario-card"
        :class="{ selected: row.draft.id === activeId, 'is-cheapest': row.draft.id === cheapestId }"
      >
        <button
          class="scenario-main"
          type="button"
          :aria-pressed="row.draft.id === activeId"
          @click="emit('select', row.draft.id)"
        >
          <span class="scenario-swatch" :class="`swatch-${index % 16}`" />
          <span class="scenario-copy">
            <span class="scenario-name">{{ scenarioName(row.draft.name) }}</span>
            <span v-if="row.result" class="scenario-price">{{ formatMoney(row.result.totalCost, currency, usdToCny) }}</span>
            <span v-else class="scenario-price scenario-error">参数待修正</span>
          </span>
          <span v-if="row.draft.id === cheapestId" class="best-badge">最低</span>
        </button>
        <button
          v-if="rows.length > 1"
          class="remove-scenario"
          type="button"
          :aria-label="`删除${scenarioName(row.draft.name)}`"
          @click="emit('remove', row.draft.id)"
        >×</button>
        <div class="scenario-detail">
          <span>输入 {{ row.draft.inputTokensM || '—' }}M</span>
          <span>缓存 {{ row.draft.cacheHitPercent || '—' }}%</span>
          <span>输出比 {{ row.draft.outputRatioPercent || '—' }}%</span>
        </div>
        <p v-if="Object.keys(row.errors).length" class="scenario-warning">{{ Object.values(row.errors)[0] }}</p>
      </article>
    </div>
  </section>
</template>
