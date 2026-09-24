<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { ModelPriceSource } from '../domain/cost'
import { fetchModelCatalog } from '../services/modelCatalog'
import type { ModelCatalogEntry } from '../services/modelCatalog'
import { loadModelCatalog, saveModelCatalog } from '../storage/modelCatalogStorage'

const props = defineProps<{
  selectedSource: ModelPriceSource | null
  exchangeRateAvailable: boolean
}>()

const emit = defineEmits<{
  select: [source: ModelPriceSource]
  clear: []
}>()

const cachedCatalog = loadModelCatalog()
const catalog = ref<ModelCatalogEntry[]>(cachedCatalog ?? [])
const catalogStatus = ref<'loading' | 'ready' | 'failed' | 'refresh-failed'>(cachedCatalog ? 'ready' : 'loading')
const catalogIsCached = ref(cachedCatalog !== null)
const catalogIsRefreshing = ref(false)
const search = ref('')
const suggestionsOpen = ref(false)
const activeIndex = ref(-1)
const MAX_VISIBLE_RESULTS = 100

function formatModelSearchLabel(source: ModelPriceSource): string {
  return `${source.providerName} - ${source.modelName}`
}

const matchingModels = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return catalog.value

  return catalog.value.filter(({ source }) =>
    `${formatModelSearchLabel(source)} ${source.providerId} ${source.modelId}`
      .toLocaleLowerCase()
      .includes(query),
  )
})

const filteredModels = computed(() => matchingModels.value.slice(0, MAX_VISIBLE_RESULTS))

const activeOptionId = computed(() => activeIndex.value >= 0
  ? `model-catalog-option-${activeIndex.value}`
  : undefined,
)

const catalogStatusText = computed(() => {
  if (catalogStatus.value === 'loading') return '正在读取 models.dev 目录…'
  if (catalogStatus.value === 'failed') return '目录暂时无法载入；现有方案仍可继续使用。'
  if (catalogStatus.value === 'refresh-failed') return '刷新失败，继续使用当前模型目录。'
  const cacheNote = catalogIsCached.value ? ' · 浏览器缓存' : ' · 本地缓存写入失败'
  return `已载入 ${catalog.value.length.toLocaleString('zh-CN')} 个可选模型${cacheNote}`
})

const availabilityHint = computed(() => props.exchangeRateAvailable
  ? '定价单位为 USD / 百万 Token；未提供缓存读取价时按输入价计算。'
  : '获取 USD/CNY 汇率后即可载入目录价格。',
)

watch(() => props.selectedSource, (source) => {
  search.value = source ? formatModelSearchLabel(source) : ''
  suggestionsOpen.value = false
  activeIndex.value = -1
}, { immediate: true })

watch(search, (query) => {
  activeIndex.value = -1
  if (!query.trim()) suggestionsOpen.value = false
})

function optionId(index: number): string {
  return `model-catalog-option-${index}`
}

function isSelected(source: ModelPriceSource): boolean {
  return props.selectedSource?.providerId === source.providerId
    && props.selectedSource.modelId === source.modelId
}

function onSearchInput() {
  suggestionsOpen.value = search.value.trim().length > 0
  activeIndex.value = -1
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    suggestionsOpen.value = search.value.trim().length > 0
    if (filteredModels.value.length > 0) {
      activeIndex.value = (activeIndex.value + 1) % filteredModels.value.length
    }
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    suggestionsOpen.value = search.value.trim().length > 0
    if (filteredModels.value.length > 0) {
      activeIndex.value = activeIndex.value <= 0
        ? filteredModels.value.length - 1
        : activeIndex.value - 1
    }
    return
  }

  if (event.key === 'Enter' && suggestionsOpen.value && activeIndex.value >= 0) {
    event.preventDefault()
    const model = filteredModels.value[activeIndex.value]
    if (model) selectModel(model)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    suggestionsOpen.value = false
    activeIndex.value = -1
  }
}

function selectModel(entry: ModelCatalogEntry) {
  if (!props.exchangeRateAvailable) return
  emit('select', entry.source)
  search.value = formatModelSearchLabel(entry.source)
  suggestionsOpen.value = false
  activeIndex.value = -1
}

async function refreshCatalog() {
  suggestionsOpen.value = false
  activeIndex.value = -1
  catalogIsRefreshing.value = true
  if (catalog.value.length === 0) catalogStatus.value = 'loading'
  try {
    const refreshedCatalog = await fetchModelCatalog()
    catalog.value = refreshedCatalog
    catalogIsCached.value = saveModelCatalog(refreshedCatalog)
    catalogStatus.value = 'ready'
  } catch {
    catalogStatus.value = catalog.value.length > 0 ? 'refresh-failed' : 'failed'
  } finally {
    catalogIsRefreshing.value = false
  }
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value)
}

onMounted(() => {
  if (!cachedCatalog) void refreshCatalog()
})
</script>

<template>
  <div class="model-catalog-picker">
    <div class="catalog-heading">
      <label for="model-catalog-search">选择模型定价</label>
      <div class="catalog-actions">
        <a href="https://models.dev/" target="_blank" rel="noopener noreferrer">models.dev ↗</a>
        <button type="button" :disabled="catalogIsRefreshing" @click="refreshCatalog">
          {{ catalogIsRefreshing ? '更新中' : '刷新目录' }}
        </button>
      </div>
    </div>

    <div class="catalog-controls">
      <input
        id="model-catalog-search"
        v-model="search"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="model-catalog-options"
        :aria-expanded="suggestionsOpen"
        :aria-activedescendant="suggestionsOpen ? activeOptionId : undefined"
        autocomplete="off"
        placeholder="搜索厂商或模型名称"
        :disabled="catalogStatus === 'loading' || catalogStatus === 'failed'"
        @focus="suggestionsOpen = catalogStatus !== 'loading' && catalogStatus !== 'failed' && search.trim().length > 0"
        @blur="suggestionsOpen = false"
        @input="onSearchInput"
        @keydown="onSearchKeydown"
      >

      <div v-show="suggestionsOpen" class="catalog-results">
        <div id="model-catalog-options" role="listbox" aria-label="模型价格结果">
          <button
            v-for="(model, index) in filteredModels"
            :id="optionId(index)"
            :key="optionId(index)"
            class="catalog-option"
            :class="{ 'is-active': activeIndex === index, 'is-selected': isSelected(model.source) }"
            type="button"
            role="option"
            :aria-selected="isSelected(model.source)"
            :disabled="!exchangeRateAvailable"
            @pointerdown.prevent
            @mouseenter="activeIndex = index"
            @click="selectModel(model)"
          >
            <span class="catalog-option-title">
              <strong>{{ model.source.providerName }}</strong>
              <span>{{ model.source.modelName }}</span>
              <span v-if="model.isFirstParty" class="catalog-origin-badge">厂商直供</span>
            </span>
            <code>{{ model.source.modelId }}</code>
            <span class="catalog-option-prices">
              <span>输入 ${{ formatUsd(model.source.inputUsdPerMillion) }}</span>
              <span>输出 ${{ formatUsd(model.source.outputUsdPerMillion) }}</span>
              <span>USD / M tokens</span>
            </span>
          </button>
        </div>
        <p v-if="filteredModels.length === 0" class="catalog-empty" role="status">
          没有匹配的模型；试试模型 ID 或厂商名称。
        </p>
        <p v-if="matchingModels.length > MAX_VISIBLE_RESULTS" class="catalog-empty" role="status">
          匹配 {{ matchingModels.length.toLocaleString('zh-CN') }} 个模型，先显示前 {{ MAX_VISIBLE_RESULTS }} 个；继续输入可缩小范围。
        </p>
      </div>
    </div>

    <p class="catalog-status" role="status">{{ catalogStatusText }}</p>
    <p class="catalog-note">{{ availabilityHint }} 价格由 models.dev 社区维护，请以对应厂商的实际计费为准。</p>

    <div v-if="selectedSource" class="catalog-selection" role="status">
      <span>
        已关联 {{ selectedSource.providerName }} · {{ selectedSource.modelName }}
        <small>目录标注更新：{{ selectedSource.lastUpdated ?? '未知' }}</small>
      </span>
      <button type="button" @click="emit('clear')">切换为自定义价格</button>
    </div>
  </div>
</template>
