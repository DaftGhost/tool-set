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
    <div className="mb-4 rounded-control border border-line-soft bg-surface-alt p-3">
      <div className="mb-2 flex items-center justify-between gap-2.5">
        <label className="text-label font-bold text-ink" htmlFor="model-catalog-search">选择模型定价</label>
        <div className="flex items-center justify-end gap-2.5">
          <a className="text-meta text-primary no-underline hover:underline" href="https://models.dev/" target="_blank" rel="noopener noreferrer">models.dev ↗</a>
          <button className="cursor-pointer rounded-control border border-line bg-surface px-2 py-1 text-meta text-primary-deep disabled:cursor-wait disabled:text-quiet" type="button" disabled={catalogIsRefreshing} onClick={() => void refreshCatalog()}>
            {catalogIsRefreshing ? '更新中' : '刷新目录'}
          </button>
        </div>
      </div>

      <div>
        <input
          id="model-catalog-search"
          className="w-full min-w-0 rounded-control border border-line bg-surface px-2 py-2 text-label text-ink disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-quiet"
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

        <div className="menu-scroll mt-1 overflow-auto rounded-control border border-line bg-surface" style={suggestionsOpen ? undefined : { display: 'none' }}>
          <div className="p-1" id="model-catalog-options" role="listbox" aria-label="模型价格结果">
            {filteredModels.map((model, index) => {
              const selected = isSelected(model.source)
              const optionClass = [
                'option-row flex w-full cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-1 bg-transparent p-2 text-left text-ink disabled:cursor-not-allowed disabled:text-quiet',
                activeIndex === index ? 'bg-primary-soft' : 'hover:bg-primary-soft',
                selected ? 'option-selected' : '',
              ].filter(Boolean).join(' ')
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
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-meta">
                    <strong className="font-bold text-primary-deep">{model.source.providerName}</strong>
                    <span>{model.source.modelName}</span>
                    {model.isFirstParty && <span className="rounded-full bg-primary-soft px-1 text-micro font-bold text-primary-deep">厂商直供</span>}
                  </span>
                  <code className="text-right font-mono text-micro break-all text-quiet">{model.source.modelId}</code>
                  <span className="flex w-full flex-wrap gap-x-2.5 gap-y-1 font-mono text-micro text-muted">
                    <span>输入 ${formatUsd(model.source.inputUsdPerMillion)}</span>
                    <span>输出 ${formatUsd(model.source.outputUsdPerMillion)}</span>
                    <span>USD / M tokens</span>
                  </span>
                </button>
              )
            })}
          </div>
          {filteredModels.length === 0 && (
            <p className="m-0 p-2.5 text-meta text-muted" role="status">没有匹配的模型；试试模型 ID 或厂商名称。</p>
          )}
          {matchingModels.length > MAX_VISIBLE_RESULTS && (
            <p className="m-0 p-2.5 text-meta text-muted" role="status">
              匹配 {matchingModels.length.toLocaleString('zh-CN')} 个模型，先显示前 {MAX_VISIBLE_RESULTS} 个；继续输入可缩小范围。
            </p>
          )}
        </div>
      </div>

      <p className="m-0 mt-2 text-meta text-muted" role="status">{catalogStatusText}</p>
      <p className="m-0 mt-1 text-micro text-quiet">{availabilityHint} 价格由 models.dev 社区维护，请以对应厂商的实际计费为准。</p>

      {selectedSource && (
        <div className="mt-2 flex items-center justify-between gap-2.5 border-t border-line pt-2 text-meta text-primary-deep max-phone:flex-col max-phone:items-start" role="status">
          <span>
            已关联 {selectedSource.providerName} · {selectedSource.modelName}{' '}
            <small className="mt-1 block text-micro text-quiet">目录标注更新：{selectedSource.lastUpdated ?? '未知'}</small>
          </span>
          <button className="shrink-0 cursor-pointer rounded-control border border-line bg-surface px-2 py-1 text-meta text-primary-deep max-phone:w-full" type="button" onClick={onClear}>切换为自定义价格</button>
        </div>
      )}
    </div>
  )
}
