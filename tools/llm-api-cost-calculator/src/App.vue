<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CostBreakdown from './components/CostBreakdown.vue'
import CostChart from './components/CostChart.vue'
import ModelCatalogPicker from './components/ModelCatalogPicker.vue'
import ParameterField from './components/ParameterField.vue'
import ScenarioComparison from './components/ScenarioComparison.vue'
import type { ComparisonRow } from './components/ScenarioComparison.vue'
import { calculateCost, formatNumber, parseScenarioDraft } from './domain/cost'
import type { DraftField, ModelPriceSource, ScenarioDraft } from './domain/cost'
import { convertPriceInputToCny, displayPriceInput } from './domain/currency'
import type { CurrencyCode, ExchangeRateSnapshot } from './domain/currency'
import type { ChartAxis, CostMetric } from './domain/chart'
import { MAX_SCENARIOS, cloneScenario, exampleScenarios } from './domain/scenarios'
import { fetchLatestUsdCnyRate } from './services/exchangeRate'
import { loadCurrencyPreferences, saveCurrencyPreferences } from './storage/currencyStorage'
import { loadScenarioState, saveScenarioState } from './storage/scenarioStorage'

const loaded = loadScenarioState()
const scenarios = ref<ScenarioDraft[]>(loaded.status === 'loaded'
  ? loaded.state.scenarios.map((scenario) => ({ ...scenario }))
  : exampleScenarios.map((scenario) => ({ ...scenario })))
const activeId = ref(loaded.status === 'loaded' ? loaded.state.activeId : scenarios.value[0].id)
const currencyPreferences = loadCurrencyPreferences()
const currency = ref<CurrencyCode>(currencyPreferences?.currency ?? 'CNY')
const exchangeRate = ref<ExchangeRateSnapshot | null>(currencyPreferences?.rate ?? null)
const rateStatus = ref<'loading' | 'current' | 'cached' | 'unavailable'>(exchangeRate.value ? 'cached' : 'loading')
const currencyPreferencesSaveFailed = ref(false)
const priceInputDrafts = ref<Record<string, Partial<Record<PriceField, string>>>>({})
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
const usdToCny = computed(() => exchangeRate.value?.usdToCny ?? 1)
const canDisplayUsd = computed(() => exchangeRate.value !== null)
const currencyUnit = computed(() => currency.value === 'USD' ? 'USD / M tokens' : 'CNY / M tokens')
const exchangeRateLabel = computed(() => {
  if (!exchangeRate.value) {
    return rateStatus.value === 'loading'
      ? '正在获取最新日度参考汇率'
      : '暂时无法获取汇率，人民币模式仍可使用'
  }
  const updateState = rateStatus.value === 'loading'
    ? '正在刷新，当前使用缓存'
    : rateStatus.value === 'cached'
      ? 'Frankfurter 本地缓存'
      : 'Frankfurter 最新参考'
  const saveState = currencyPreferencesSaveFailed.value ? ' · 设置未能保存' : ''
  return `${updateState} · 1 USD = ${formatNumber(exchangeRate.value.usdToCny, 4)} CNY · 数据日期 ${exchangeRate.value.date}${saveState}`
})
const exchangeRateSummary = computed(() => exchangeRate.value
  ? `1 USD = ${formatNumber(exchangeRate.value.usdToCny, 4)} CNY · ${exchangeRate.value.date}`
  : rateStatus.value === 'loading' ? '正在获取 USD/CNY 参考汇率' : 'USD/CNY 汇率暂不可用')
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
let exchangeRateTimer: number | undefined
let rateRequestInFlight = false

watch([scenarios, activeId], () => {
  window.clearTimeout(saveTimer)
  saveStatus.value = 'saving'
  saveTimer = window.setTimeout(() => {
    const saved = saveScenarioState({ scenarios: scenarios.value, activeId: activeId.value })
    saveStatus.value = saved ? 'saved' : 'failed'
    saveNotice.value = saved ? '' : '方案未能保存，离开页面后这些修改可能丢失。请检查可用空间后重试。'
  }, 350)
}, { deep: true })

watch([currency, exchangeRate], () => {
  currencyPreferencesSaveFailed.value = !saveCurrencyPreferences({
    currency: currency.value,
    rate: exchangeRate.value,
  })
})

watch(exchangeRate, (rate) => {
  if (!rate) return
  for (const scenario of scenarios.value) {
    if (scenario.modelPriceSource) applyCatalogPrices(scenario, scenario.modelPriceSource, rate.usdToCny)
  }
})

watch([chartAxis, chartMetric], () => {
  selectedIntersection.value = null
})

onMounted(() => {
  void refreshExchangeRate()
  exchangeRateTimer = window.setInterval(() => void refreshExchangeRate(), 12 * 60 * 60 * 1000)
})

onBeforeUnmount(() => {
  window.clearTimeout(saveTimer)
  window.clearInterval(exchangeRateTimer)
})

type PriceField = 'cachedPrice' | 'uncachedPrice' | 'outputPrice'

function priceInputValue(field: PriceField): string {
  const draft = priceInputDrafts.value[activeId.value]?.[field]
  return draft ?? displayPriceInput(activeScenario.value[field], currency.value, usdToCny.value)
}

function updatePriceField(field: PriceField, value: string) {
  priceInputDrafts.value = {
    ...priceInputDrafts.value,
    [activeId.value]: { ...priceInputDrafts.value[activeId.value], [field]: value },
  }
  activeScenario.value[field] = convertPriceInputToCny(value, currency.value, usdToCny.value)
}

function finishPriceEdit(field: PriceField) {
  const drafts = { ...priceInputDrafts.value }
  const activeDrafts = { ...drafts[activeId.value] }
  delete activeDrafts[field]
  if (Object.keys(activeDrafts).length > 0) drafts[activeId.value] = activeDrafts
  else delete drafts[activeId.value]
  priceInputDrafts.value = drafts
}

function compactPrice(value: number): string {
  return Number(value.toPrecision(15)).toString()
}

function applyCatalogPrices(scenario: ScenarioDraft, source: ModelPriceSource, usdToCnyRate: number) {
  scenario.cachedPrice = compactPrice(source.cacheReadUsdPerMillion * usdToCnyRate)
  scenario.uncachedPrice = compactPrice(source.inputUsdPerMillion * usdToCnyRate)
  scenario.outputPrice = compactPrice(source.outputUsdPerMillion * usdToCnyRate)
}

function selectCatalogPrice(source: ModelPriceSource) {
  activeScenario.value.modelPriceSource = { ...source }
  activeScenario.value.name = `${source.providerName} · ${source.modelName}`.slice(0, 32)
  applyCatalogPrices(activeScenario.value, source, usdToCny.value)
  finishPriceEdit('cachedPrice')
  finishPriceEdit('uncachedPrice')
  finishPriceEdit('outputPrice')
}

function clearCatalogPrice() {
  delete activeScenario.value.modelPriceSource
}

function setCurrency(nextCurrency: CurrencyCode) {
  if (nextCurrency === 'USD' && !exchangeRate.value) return
  currency.value = nextCurrency
  priceInputDrafts.value = {}
}

async function refreshExchangeRate() {
  if (rateRequestInFlight) return
  rateRequestInFlight = true
  rateStatus.value = 'loading'
  try {
    const latestRate = await fetchLatestUsdCnyRate()
    priceInputDrafts.value = {}
    exchangeRate.value = latestRate
    rateStatus.value = 'current'
  } catch {
    rateStatus.value = exchangeRate.value ? 'cached' : 'unavailable'
  } finally {
    rateRequestInFlight = false
  }
}

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
  return ''
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#top" aria-label="Token Cost 首页">
        <span class="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span class="brand-name">token<span>cost</span></span>
      </a>
      <div class="topbar-tools">
        <div class="currency-switch" role="group" aria-label="金额显示币种">
          <button type="button" :aria-pressed="currency === 'CNY'" @click="setCurrency('CNY')">CNY</button>
          <button
            type="button"
            :aria-pressed="currency === 'USD'"
            :disabled="!canDisplayUsd"
            :title="canDisplayUsd ? '显示美元金额' : '获取汇率后可切换美元'"
            @click="setCurrency('USD')"
          >USD</button>
        </div>
        <div
          v-if="saveStatusLabel()"
          class="save-status"
          :class="{
            'status-error': saveStatus === 'failed' || (saveStatus === 'idle' && loaded.status === 'unavailable'),
            'status-saving': saveStatus === 'saving',
          }"
          aria-live="polite"
        >
          <span class="save-dot" />
          <span>{{ saveStatusLabel() }}</span>
        </div>
      </div>
    </header>

    <main id="top" class="main-content">
      <section class="page-intro" aria-labelledby="page-title">
        <div class="rate-status-row">
          <span
            class="rate-status"
            :class="`rate-${rateStatus}`"
            role="status"
            :aria-label="exchangeRateLabel"
            :title="exchangeRateLabel"
          >{{ exchangeRateSummary }}</span>
          <button
            class="rate-refresh"
            type="button"
            :disabled="rateStatus === 'loading'"
            :aria-label="rateStatus === 'loading' ? '正在刷新 USD/CNY 参考汇率' : '刷新 USD/CNY 参考汇率'"
            @click="refreshExchangeRate"
          >{{ rateStatus === 'loading' ? '更新中' : '刷新汇率' }}</button>
        </div>
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
        :currency="currency"
        :usd-to-cny="usdToCny"
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
              <div class="price-meta">
                <span class="price-unit-label">{{ currencyUnit }}</span>
              </div>
            </div>
            <ModelCatalogPicker
              :selected-source="activeScenario.modelPriceSource ?? null"
              :exchange-rate-available="canDisplayUsd"
              @select="selectCatalogPrice"
              @clear="clearCatalogPrice"
            />
            <div class="price-fields">
              <ParameterField
                id="cached-price"
                label="缓存输入"
                :unit="currency === 'USD' ? '$ / M' : '¥ / M'"
                :model-value="priceInputValue('cachedPrice')"
                :read-only="Boolean(activeScenario.modelPriceSource)"
                :step="0.01"
                :error="activeParsing.ok ? undefined : activeParsing.errors.cachedPrice"
                @update:model-value="updatePriceField('cachedPrice', $event)"
                @blur="finishPriceEdit('cachedPrice')"
              />
              <ParameterField
                id="uncached-price"
                label="未缓存输入"
                :unit="currency === 'USD' ? '$ / M' : '¥ / M'"
                :model-value="priceInputValue('uncachedPrice')"
                :read-only="Boolean(activeScenario.modelPriceSource)"
                :step="0.01"
                :error="activeParsing.ok ? undefined : activeParsing.errors.uncachedPrice"
                @update:model-value="updatePriceField('uncachedPrice', $event)"
                @blur="finishPriceEdit('uncachedPrice')"
              />
              <ParameterField
                id="output-price"
                label="输出"
                :unit="currency === 'USD' ? '$ / M' : '¥ / M'"
                :model-value="priceInputValue('outputPrice')"
                :read-only="Boolean(activeScenario.modelPriceSource)"
                :step="0.01"
                :error="activeParsing.ok ? undefined : activeParsing.errors.outputPrice"
                @update:model-value="updatePriceField('outputPrice', $event)"
                @blur="finishPriceEdit('outputPrice')"
              />
            </div>
            <p class="parameter-note">切换币种会按页面显示的参考汇率换算单价、成本和图表。</p>
          </div>
        </section>

        <CostBreakdown :result="activeResult" :currency="currency" :usd-to-cny="usdToCny" />
      </section>

      <CostChart
        v-model:axis="chartAxis"
        v-model:metric="chartMetric"
        v-model:cursor-fraction="chartCursorFraction"
        :entries="chartEntries"
        :selected-key="selectedIntersection"
        :currency="currency"
        :usd-to-cny="usdToCny"
        @select-intersection="selectedIntersection = $event"
      />
    </main>

  </div>
</template>
