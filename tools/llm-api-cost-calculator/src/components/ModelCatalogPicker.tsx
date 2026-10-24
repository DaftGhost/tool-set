import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ModelPriceSource } from '../domain/cost'
import { fetchModelCatalog } from '../services/modelCatalog'
import type { ModelCatalogEntry } from '../services/modelCatalog'
import { loadModelCatalog, saveModelCatalog } from '../storage/modelCatalogStorage'

type CatalogStatus = 'loading' | 'ready' | 'failed' | 'refresh-failed'

type ModelCatalogPickerProps = {
  selectedSource: ModelPriceSource | null
  exchangeRateAvailable: boolean
  onSelect(source: ModelPriceSource): void
  onClear(): void
}

const MAX_VISIBLE_RESULTS = 100

function formatModelSearchLabel(source: ModelPriceSource): string {
  return `${source.providerName} - ${source.modelName}`
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value)
}

function optionId(index: number): string {
  return `model-catalog-option-${index}`
}

export function ModelCatalogPicker({ selectedSource, exchangeRateAvailable, onSelect, onClear }: ModelCatalogPickerProps) {
  const [cachedCatalog] = useState(() => loadModelCatalog())
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>(() => cachedCatalog ?? [])
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>(() => cachedCatalog ? 'ready' : 'loading')
  const [catalogIsCached, setCatalogIsCached] = useState(() => cachedCatalog !== null)
  const [catalogIsRefreshing, setCatalogIsRefreshing] = useState(false)
  const [search, setSearch] = useState(() => selectedSource ? formatModelSearchLabel(selectedSource) : '')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Same behaviour as a watcher on the selected source: when the source object changes (including the first render), sync the search text and close the list.
  const [syncedSource, setSyncedSource] = useState(selectedSource)
  const catalogRequestInFlight = useRef(false)

  if (selectedSource !== syncedSource) {
    setSyncedSource(selectedSource)
    setSearch(selectedSource ? formatModelSearchLabel(selectedSource) : '')
    setSuggestionsOpen(false)
    setActiveIndex(-1)
  }

  const query = search.trim().toLocaleLowerCase()
  const matchingModels = query
    ? catalog.filter(({ source }) =>
        `${formatModelSearchLabel(source)} ${source.providerId} ${source.modelId}`
          .toLocaleLowerCase()
          .includes(query),
      )
    : catalog
  const filteredModels = matchingModels.slice(0, MAX_VISIBLE_RESULTS)
  const activeOptionId = activeIndex >= 0 ? optionId(activeIndex) : undefined

  const catalogStatusText = (() => {
    if (catalogStatus === 'loading') return '正在读取 models.dev 目录…'
    if (catalogStatus === 'failed') return '目录暂时无法载入；现有方案仍可继续使用。'
    if (catalogStatus === 'refresh-failed') return '刷新失败，继续使用当前模型目录。'
    const cacheNote = catalogIsCached ? ' · 浏览器缓存' : ' · 本地缓存写入失败'
    return `已载入 ${catalog.length.toLocaleString('zh-CN')} 个可选模型${cacheNote}`
  })()

  const availabilityHint = exchangeRateAvailable
    ? '定价单位为 USD / 百万 Token；未提供缓存读取价时按输入价计算。'
    : '获取 USD/CNY 汇率后即可载入目录价格。'

  function isSelected(source: ModelPriceSource): boolean {
    return selectedSource?.providerId === source.providerId && selectedSource.modelId === source.modelId
  }

  function onSearchChange(value: string) {
    setSearch(value)
    setActiveIndex(-1)
    setSuggestionsOpen(value.trim().length > 0)
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSuggestionsOpen(search.trim().length > 0)
      if (filteredModels.length > 0) setActiveIndex((activeIndex + 1) % filteredModels.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSuggestionsOpen(search.trim().length > 0)
      if (filteredModels.length > 0) {
        setActiveIndex(activeIndex <= 0 ? filteredModels.length - 1 : activeIndex - 1)
      }
      return
    }

    if (event.key === 'Enter' && suggestionsOpen && activeIndex >= 0) {
      event.preventDefault()
      const model = filteredModels[activeIndex]
      if (model) selectModel(model)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setSuggestionsOpen(false)
      setActiveIndex(-1)
    }
  }

  function selectModel(entry: ModelCatalogEntry) {
    if (!exchangeRateAvailable) return
    onSelect(entry.source)
    setSearch(formatModelSearchLabel(entry.source))
    setSuggestionsOpen(false)
    setActiveIndex(-1)
  }

  async function refreshCatalog() {
    if (catalogRequestInFlight.current) return
    catalogRequestInFlight.current = true
    setSuggestionsOpen(false)
    setActiveIndex(-1)
    setCatalogIsRefreshing(true)
    if (catalog.length === 0) setCatalogStatus('loading')
    try {
      const refreshed = await fetchModelCatalog()
      setCatalog(refreshed)
      setCatalogIsCached(saveModelCatalog(refreshed))
      setCatalogStatus('ready')
    } catch {
      setCatalogStatus(catalog.length > 0 ? 'refresh-failed' : 'failed')
    } finally {
      setCatalogIsRefreshing(false)
      catalogRequestInFlight.current = false
    }
  }

  // Runs once on open when no catalog is cached. The in-flight flag absorbs the second call from StrictMode's double effect run.
  useEffect(() => {
    if (!cachedCatalog) void refreshCatalog()
  }, [])

  return (
    <div className="model-catalog-picker">
      <div className="catalog-heading">
        <label htmlFor="model-catalog-search">选择模型定价</label>
        <div className="catalog-actions">
          <a href="https://models.dev/" target="_blank" rel="noopener noreferrer">models.dev ↗</a>
          <button type="button" disabled={catalogIsRefreshing} onClick={() => void refreshCatalog()}>
            {catalogIsRefreshing ? '更新中' : '刷新目录'}
          </button>
        </div>
      </div>

      <div className="catalog-controls">
        <input
          id="model-catalog-search"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="model-catalog-options"
          aria-expanded={suggestionsOpen}
          aria-activedescendant={suggestionsOpen ? activeOptionId : undefined}
          autoComplete="off"
          placeholder="搜索厂商或模型名称"
          disabled={catalogStatus === 'loading' || catalogStatus === 'failed'}
          value={search}
          onFocus={() => setSuggestionsOpen(catalogStatus !== 'loading' && catalogStatus !== 'failed' && search.trim().length > 0)}
          onBlur={() => setSuggestionsOpen(false)}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
        />

        <div className="catalog-results" style={suggestionsOpen ? undefined : { display: 'none' }}>
          <div id="model-catalog-options" role="listbox" aria-label="模型价格结果">
            {filteredModels.map((model, index) => {
              const selected = isSelected(model.source)
              const optionClass = ['catalog-option', activeIndex === index && 'is-active', selected && 'is-selected'].filter(Boolean).join(' ')
              return (
                <button
                  key={optionId(index)}
                  id={optionId(index)}
                  className={optionClass}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={!exchangeRateAvailable}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectModel(model)}
                >
                  <span className="catalog-option-title">
                    <strong>{model.source.providerName}</strong>
                    <span>{model.source.modelName}</span>
                    {model.isFirstParty && <span className="catalog-origin-badge">厂商直供</span>}
                  </span>
                  <code>{model.source.modelId}</code>
                  <span className="catalog-option-prices">
                    <span>输入 ${formatUsd(model.source.inputUsdPerMillion)}</span>
                    <span>输出 ${formatUsd(model.source.outputUsdPerMillion)}</span>
                    <span>USD / M tokens</span>
                  </span>
                </button>
              )
            })}
          </div>
          {filteredModels.length === 0 && (
            <p className="catalog-empty" role="status">没有匹配的模型；试试模型 ID 或厂商名称。</p>
          )}
          {matchingModels.length > MAX_VISIBLE_RESULTS && (
            <p className="catalog-empty" role="status">
              匹配 {matchingModels.length.toLocaleString('zh-CN')} 个模型，先显示前 {MAX_VISIBLE_RESULTS} 个；继续输入可缩小范围。
            </p>
          )}
        </div>
      </div>

      <p className="catalog-status" role="status">{catalogStatusText}</p>
      <p className="catalog-note">{availabilityHint} 价格由 models.dev 社区维护，请以对应厂商的实际计费为准。</p>

      {selectedSource && (
        <div className="catalog-selection" role="status">
          <span>
            已关联 {selectedSource.providerName} · {selectedSource.modelName}{' '}
            <small>目录标注更新：{selectedSource.lastUpdated ?? '未知'}</small>
          </span>
          <button type="button" onClick={onClear}>切换为自定义价格</button>
        </div>
      )}
    </div>
  )
}
