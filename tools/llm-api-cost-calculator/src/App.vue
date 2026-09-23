<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import CostBreakdown from './components/CostBreakdown.vue'
import CostChart from './components/CostChart.vue'
import ParameterField from './components/ParameterField.vue'
import ScenarioComparison from './components/ScenarioComparison.vue'
import type { ComparisonRow } from './components/ScenarioComparison.vue'
import { calculateCost, parseScenarioDraft } from './domain/cost'
import type { DraftField, ScenarioDraft } from './domain/cost'
import type { ChartAxis, CostMetric } from './domain/chart'
import { MAX_SCENARIOS, cloneScenario, exampleScenarios } from './domain/scenarios'
import { loadScenarioState, saveScenarioState } from './storage/scenarioStorage'

const loaded = loadScenarioState()
const scenarios = ref<ScenarioDraft[]>(loaded.status === 'loaded'
  ? loaded.state.scenarios.map((scenario) => ({ ...scenario }))
  : exampleScenarios.map((scenario) => ({ ...scenario })))
const activeId = ref(loaded.status === 'loaded' ? loaded.state.activeId : scenarios.value[0].id)
const chartAxis = ref<ChartAxis>('cacheHitPercent')
const chartMetric = ref<CostMetric>('total')
const chartCursorFraction = ref(0.97)
const selectedIntersection = ref<string | null>(null)
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
const saveNotice = ref(
  loaded.status === 'invalid'
    ? '上次的方案无法读取，已载入示例方案。修改并保存后，可以继续使用新方案。'
    : loaded.status === 'unavailable'
      ? '无法保存方案；离开页面后，当前修改可能丢失。'
      : '',
)

const activeScenario = computed(() => scenarios.value.find(({ id }) => id === activeId.value) ?? scenarios.value[0])
const activeParsing = computed(() => parseScenarioDraft(activeScenario.value))
const activeResult = computed(() => activeParsing.value.ok ? calculateCost(activeParsing.value.value) : null)
const comparisonRows = computed<ComparisonRow[]>(() => scenarios.value.map((draft) => {
  const parsed = parseScenarioDraft(draft)
  return {
    draft,
    result: parsed.ok ? calculateCost(parsed.value) : null,
    errors: parsed.ok ? {} : parsed.errors,
  }
}))
const chartEntries = computed(() => comparisonRows.value.flatMap(({ draft }, colorIndex) => {
  const parsed = parseScenarioDraft(draft)
  return parsed.ok ? [{ id: draft.id, name: draft.name.trim() || '未命名方案', input: parsed.value, colorIndex }] : []
}))
const scenarioLimitReached = computed(() => scenarios.value.length >= MAX_SCENARIOS)

let saveTimer: number | undefined

watch([scenarios, activeId], () => {
  window.clearTimeout(saveTimer)
  saveStatus.value = 'saving'
  saveTimer = window.setTimeout(() => {
    const saved = saveScenarioState({ scenarios: scenarios.value, activeId: activeId.value })
    saveStatus.value = saved ? 'saved' : 'failed'
    saveNotice.value = saved ? '' : '方案未能保存，离开页面后这些修改可能丢失。请检查可用空间后重试。'
  }, 350)
}, { deep: true })

watch([chartAxis, chartMetric], () => {
  selectedIntersection.value = null
})

onBeforeUnmount(() => window.clearTimeout(saveTimer))

function updateField(field: DraftField, value: string) {
  activeScenario.value[field] = value
}

function updateScenarioName(value: string) {
  activeScenario.value.name = value.slice(0, 32)
}

function addScenario() {
  const scenario = cloneScenario(activeScenario.value, scenarios.value)
  if (!scenario) return
  scenarios.value.push(scenario)
  activeId.value = scenario.id
}

function removeScenario(id: string) {
  if (scenarios.value.length <= 1) return
  const index = scenarios.value.findIndex((scenario) => scenario.id === id)
  if (index < 0) return
  const nextActive = id === activeId.value ? scenarios.value[index === 0 ? 1 : index - 1] : null
  scenarios.value = scenarios.value.filter((scenario) => scenario.id !== id)
  if (nextActive) activeId.value = nextActive.id
}

function selectScenario(id: string) {
  activeId.value = id
}

function saveStatusLabel(): string {
  if (saveStatus.value === 'saving') return '正在保存'
  if (saveStatus.value === 'failed') return '保存失败'
  if (saveStatus.value === 'saved' || loaded.status === 'loaded') return '已保存'
  if (loaded.status === 'unavailable') return '无法保存'
  return '示例方案'
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#top" aria-label="Token Cost 首页">
        <span class="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span class="brand-name">token<span>cost</span></span>
      </a>
      <div
        class="save-status"
        :class="{
          'status-error': saveStatus === 'failed' || (saveStatus === 'idle' && loaded.status === 'unavailable'),
          'status-saving': saveStatus === 'saving',
          'status-example': saveStatus === 'idle' && loaded.status !== 'loaded' && loaded.status !== 'unavailable',
        }"
        aria-live="polite"
      >
        <span class="save-dot" />
        <span>{{ saveStatusLabel() }}</span>
      </div>
    </header>

    <main id="top" class="main-content">
      <section class="page-intro" aria-labelledby="page-title">
        <div>
          <p class="eyebrow">LLM API · 调用成本</p>
          <h1 id="page-title">LLM API <em>成本计算器</em></h1>
        </div>
        <p class="intro-copy">维护价格方案，估算不同请求用量下的成本。</p>
      </section>

      <div v-if="saveNotice" class="storage-notice" role="status">
        <span class="notice-icon" aria-hidden="true">i</span>
        <p>{{ saveNotice }}</p>
        <button type="button" aria-label="关闭提示" @click="saveNotice = ''">×</button>
      </div>

      <ScenarioComparison
        :rows="comparisonRows"
        :active-id="activeId"
        :limit-reached="scenarioLimitReached"
        @select="selectScenario"
        @remove="removeScenario"
        @add="addScenario"
      />

      <section class="workbench-grid" aria-label="当前方案参数与成本">
        <section class="parameter-panel surface" aria-labelledby="parameters-title">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">当前方案</p>
              <h2 id="parameters-title">调用参数</h2>
            </div>
            <span class="editing-chip"><span />正在编辑</span>
          </div>

          <label class="scenario-name-label" for="scenario-name">方案名称</label>
          <input
            id="scenario-name"
            class="scenario-name-input"
            :value="activeScenario.name"
            maxlength="32"
            @input="updateScenarioName(($event.target as HTMLInputElement).value)"
          >

          <div class="parameter-list">
            <ParameterField
              id="input-tokens"
              label="输入 Token"
              unit="M tokens"
              :model-value="activeScenario.inputTokensM"
              :step="1"
              :error="activeParsing.ok ? undefined : activeParsing.errors.inputTokensM"
              @update:model-value="updateField('inputTokensM', $event)"
            />
            <ParameterField
              id="cache-hit"
              label="缓存命中率"
              unit="%"
              :model-value="activeScenario.cacheHitPercent"
              :step="1"
              :max="100"
              :error="activeParsing.ok ? undefined : activeParsing.errors.cacheHitPercent"
              @update:model-value="updateField('cacheHitPercent', $event)"
            />
            <ParameterField
              id="output-ratio"
              label="输出占输入比例"
              unit="%"
              :model-value="activeScenario.outputRatioPercent"
              :step="0.5"
              :error="activeParsing.ok ? undefined : activeParsing.errors.outputRatioPercent"
              @update:model-value="updateField('outputRatioPercent', $event)"
            />
          </div>

          <div class="price-section">
            <div class="price-heading">
              <div>
                <p class="eyebrow">单价 / 百万 Token</p>
                <h3>模型单价</h3>
              </div>
              <span>元 / M tokens</span>
            </div>
            <div class="price-fields">
              <ParameterField
                id="cached-price"
                label="缓存输入"
                unit="¥ / M"
                :model-value="activeScenario.cachedPrice"
                :step="0.01"
                :error="activeParsing.ok ? undefined : activeParsing.errors.cachedPrice"
                @update:model-value="updateField('cachedPrice', $event)"
              />
              <ParameterField
                id="uncached-price"
                label="未缓存输入"
                unit="¥ / M"
                :model-value="activeScenario.uncachedPrice"
                :step="0.01"
                :error="activeParsing.ok ? undefined : activeParsing.errors.uncachedPrice"
                @update:model-value="updateField('uncachedPrice', $event)"
              />
              <ParameterField
                id="output-price"
                label="输出"
                unit="¥ / M"
                :model-value="activeScenario.outputPrice"
                :step="0.01"
                :error="activeParsing.ok ? undefined : activeParsing.errors.outputPrice"
                @update:model-value="updateField('outputPrice', $event)"
              />
            </div>
            <p class="parameter-note">所有单价统一按每百万 Token 填写；修改时结果会即时更新。</p>
          </div>
        </section>

        <CostBreakdown :result="activeResult" />
      </section>

      <CostChart
        v-model:axis="chartAxis"
        v-model:metric="chartMetric"
        v-model:cursor-fraction="chartCursorFraction"
        :entries="chartEntries"
        :selected-key="selectedIntersection"
        @select-intersection="selectedIntersection = $event"
      />
    </main>

  </div>
</template>
