import { useState } from 'react'
import { HomeOrb } from '../../../shared/home-orb/HomeOrb'
import { ContextPricingControls } from './components/ContextPricingControls'
import { CostBreakdown } from './components/CostBreakdown'
import { CostChart } from './components/CostChart'
import { ModelCatalogPicker } from './components/ModelCatalogPicker'
import { ParameterField } from './components/ParameterField'
import { ScenarioComparison } from './components/ScenarioComparison'
import type { ComparisonRow } from './components/ScenarioComparison'
import { RequestPricing, calculateCost, formatNumber, parseScenarioDraft } from './domain/cost'
import type { DraftField, ModelPriceSource } from './domain/cost'
import { convertPriceInputToCny, displayPriceInput } from './domain/currency'
import type { CurrencyCode } from './domain/currency'
import type { ChartAxis, CostMetric } from './domain/chart'
import { MAX_SCENARIOS, cloneScenario } from './domain/scenarios'
import { useExchangeRate } from './useExchangeRate'
import { activeIndexOf, useScenarioState } from './useScenarioState'

type PriceField = 'cachedPrice' | 'cacheWritePrice' | 'uncachedPrice' | 'outputPrice'
type PriceInputDrafts = Record<string, Partial<Record<PriceField, string>>>

export function App() {
  const [priceInputDrafts, setPriceInputDrafts] = useState<PriceInputDrafts>({})
  const [chartAxis, setChartAxis] = useState<ChartAxis>('cacheHitPercent')
  const [chartMetric, setChartMetric] = useState<CostMetric>('total')
  const [chartCursorFraction, setChartCursorFraction] = useState(0.97)
  const [selectedIntersection, setSelectedIntersection] = useState<string | null>(null)
  const { state, dispatch, saveStatus, saveNotice, setSaveNotice, loadStatus } = useScenarioState()
  const { currency, exchangeRate, rateStatus, saveFailed: currencyPreferencesSaveFailed, changeCurrency, refreshRate } = useExchangeRate({
    onRateRefreshed(latest) {
      setPriceInputDrafts({})
      dispatch({ type: 'reprice', usdToCny: latest.usdToCny })
    },
  })
  const { scenarios, activeId } = state
  const activeScenario = scenarios[activeIndexOf(scenarios, activeId)]
  const usdToCny = exchangeRate?.usdToCny ?? 1
  const canDisplayUsd = exchangeRate !== null
  const currencyUnit = currency === 'USD' ? 'USD / M tokens' : 'CNY / M tokens'
  const exchangeRateLabel = exchangeRate
    ? `${rateStatus === 'loading'
      ? '正在刷新，当前使用缓存'
      : rateStatus === 'cached'
        ? 'Frankfurter 本地缓存'
        : 'Frankfurter 最新参考'} · 1 USD = ${formatNumber(exchangeRate.usdToCny, 4)} CNY · 数据日期 ${exchangeRate.date}${currencyPreferencesSaveFailed ? ' · 设置未能保存' : ''}`
    : rateStatus === 'loading' ? '正在获取最新日度参考汇率' : '暂时无法获取汇率，人民币模式仍可使用'
  const exchangeRateSummary = exchangeRate
    ? `1 USD = ${formatNumber(exchangeRate.usdToCny, 4)} CNY · ${exchangeRate.date}`
    : rateStatus === 'loading' ? '正在获取 USD/CNY 参考汇率' : 'USD/CNY 汇率暂不可用'
  const activeParsing = parseScenarioDraft(activeScenario)
  const activeResult = activeParsing.ok ? calculateCost(activeParsing.value) : null
  const comparisonRows: ComparisonRow[] = scenarios.map((draft) => {
    const parsed = parseScenarioDraft(draft)
    return {
      draft,
      result: parsed.ok ? calculateCost(parsed.value) : null,
      errors: parsed.ok ? {} : parsed.errors,
    }
  })
  const chartEntries = comparisonRows.flatMap(({ draft }, colorIndex) => {
    const parsed = parseScenarioDraft(draft)
    return parsed.ok ? [{ id: draft.id, name: draft.name.trim() || '未命名方案', input: parsed.value, colorIndex }] : []
  })
  const scenarioLimitReached = scenarios.length >= MAX_SCENARIOS
  const saveStatusText = saveStatus === 'saving'
    ? '正在保存'
    : saveStatus === 'failed'
      ? '保存失败'
      : saveStatus === 'saved' || loadStatus === 'loaded'
        ? '已保存'
        : loadStatus === 'unavailable' ? '无法保存' : ''
  const saveStatusError = saveStatus === 'failed' || (saveStatus === 'idle' && loadStatus === 'unavailable')
  const saveDotClass = saveStatus === 'saving'
    ? 'size-2 shrink-0 rounded-full bg-brass status-halo-brass max-phone:size-1.5'
    : saveStatusError
      ? 'size-2 shrink-0 rounded-full bg-clay status-halo-warn max-phone:size-1.5'
      : 'size-2 shrink-0 rounded-full bg-primary status-halo max-phone:size-1.5'
  const rateColor = rateStatus === 'cached' ? 'text-brass' : rateStatus === 'unavailable' ? 'text-danger' : 'text-quiet'

  function priceInputValue(field: PriceField): string {
    const draft = priceInputDrafts[activeId]?.[field]
    return draft ?? displayPriceInput(activeScenario[field], currency, usdToCny)
  }

  function updatePriceField(field: PriceField, value: string) {
    setPriceInputDrafts((drafts) => ({
      ...drafts,
      [activeId]: { ...drafts[activeId], [field]: value },
    }))
    const stored = value.trim() === '' ? '' : convertPriceInputToCny(value, currency, usdToCny)
    dispatch({ type: 'setField', field, value: stored, usdToCny })
  }

  function finishPriceEdit(...fields: PriceField[]) {
    const draftsForScenario = priceInputDrafts[activeId]
    for (const field of fields) {
      const draft = draftsForScenario?.[field]
      if (draft !== undefined && draft.trim() === '') {
        dispatch({ type: 'setField', field, value: '0', usdToCny })
      }
    }
    setPriceInputDrafts((drafts) => {
      const next = { ...drafts }
      const activeDrafts = { ...next[activeId] }
      for (const field of fields) delete activeDrafts[field]
      if (Object.keys(activeDrafts).length > 0) next[activeId] = activeDrafts
      else delete next[activeId]
      return next
    })
  }

  function selectCatalogPrice(source: ModelPriceSource) {
    dispatch({ type: 'link', source, usdToCny })
    finishPriceEdit('cachedPrice', 'cacheWritePrice', 'uncachedPrice', 'outputPrice')
  }

  function selectCurrency(next: CurrencyCode) {
    if (next === 'USD' && !exchangeRate) return
    changeCurrency(next)
    setPriceInputDrafts({})
  }

  function changeAxis(axis: ChartAxis) {
    if (axis === chartAxis) return
    setChartAxis(axis)
    setSelectedIntersection(null)
  }

  function changeMetric(metric: CostMetric) {
    if (metric === chartMetric) return
    setChartMetric(metric)
    setSelectedIntersection(null)
  }

  function addScenario() {
    const scenario = cloneScenario(activeScenario, scenarios)
    if (scenario) dispatch({ type: 'add', scenario })
  }

  function commitBlank(field: DraftField) {
    if (activeScenario[field].trim() === '') {
      dispatch({ type: 'setField', field, value: '0', usdToCny })
    }
  }

  function shareCap(value: string): number {
    const parsed = RequestPricing.readNonNegative(value)
    if (parsed === null) return 0
    return Math.min(parsed, 100)
  }

  const hitShare = RequestPricing.readNonNegative(activeScenario.cacheHitPercent)
  const writeShare = RequestPricing.readNonNegative(activeScenario.cacheWritePercent)
  const uncachedShare = hitShare !== null && writeShare !== null && hitShare + writeShare <= 100 + 1e-6
    ? formatNumber(Math.max(0, 100 - hitShare - writeShare), 4)
    : null
  const writePriceLocked = Boolean(activeScenario.modelPriceSource)

  const priceFieldProps = (field: PriceField, readOnly = Boolean(activeScenario.modelPriceSource)) => ({
    unit: currency === 'USD' ? '$ / M' : '¥ / M',
    value: priceInputValue(field),
    readOnly,
    step: 0.01,
    error: activeParsing.ok ? undefined : activeParsing.errors[field],
    onChange: (value: string) => updatePriceField(field, value),
    onBlur: () => finishPriceEdit(field),
  })

  const currencyButtonClass = 'min-w-control cursor-pointer rounded-badge border-0 bg-transparent px-1.5 py-1.5 font-mono text-micro text-muted aria-pressed:bg-primary-deep aria-pressed:text-surface disabled:cursor-not-allowed disabled:text-quiet'

  return (
    <div className="min-h-screen">
      <HomeOrb />
      <header className="page-inset flex h-header items-center justify-between border-b border-line bg-surface/90 max-phone:h-header-phone">
        <a className="home-orb-offset inline-flex items-center gap-2.5 text-ink no-underline max-phone:gap-2" href="#top" aria-label="Token Cost 首页">
          <span className="flex size-gutter items-end gap-1 rounded-control bg-primary-deep p-1" aria-hidden="true">
            <i className="block h-2 w-1 rounded-full bg-surface opacity-70" />
            <i className="block h-3 w-1 rounded-full bg-surface" />
            <i className="block h-2 w-1 rounded-full bg-surface opacity-85" />
          </span>
          <span className="text-brand">token<span className="text-primary">cost</span></span>
        </a>
        <div className="flex items-center gap-section max-stack:gap-3 max-phone:gap-2">
          <div className="inline-flex gap-0 rounded-control border border-line bg-surface-alt p-1" role="group" aria-label="金额显示币种">
            <button className={currencyButtonClass} type="button" aria-pressed={currency === 'CNY'} onClick={() => selectCurrency('CNY')}>CNY</button>
            <button
              className={currencyButtonClass}
              type="button"
              aria-pressed={currency === 'USD'}
              disabled={!canDisplayUsd}
              title={canDisplayUsd ? '显示美元金额' : '获取汇率后可切换美元'}
              onClick={() => selectCurrency('USD')}
            >USD</button>
          </div>
          {saveStatusText && (
            <div className="inline-flex items-center gap-2 text-label text-muted max-phone:gap-1.5 max-phone:text-micro" aria-live="polite">
              <span className={saveDotClass} />
              <span>{saveStatusText}</span>
            </div>
          )}
        </div>
      </header>

      <main id="top" className="content-frame">
        <section className="relative mb-gutter flex items-end justify-between gap-control max-stack:mb-5 max-stack:flex-col max-stack:items-start max-stack:gap-3.5 max-phone:mb-section max-phone:gap-2.5" aria-labelledby="page-title">
          <div className="absolute -top-section right-0 z-10 flex w-full max-w-summary items-center justify-end gap-2">
            <span
              className={`min-w-0 overflow-hidden text-right text-micro text-ellipsis whitespace-nowrap ${rateColor}`}
              role="status"
              aria-label={exchangeRateLabel}
              title={exchangeRateLabel}
            >{exchangeRateSummary}</span>
            <button
              className="shrink-0 cursor-pointer rounded-control border border-line bg-surface px-2 py-1 text-micro text-primary-deep hover:border-primary-muted hover:bg-surface-alt disabled:cursor-wait disabled:bg-surface-alt disabled:text-quiet"
              type="button"
              disabled={rateStatus === 'loading'}
              aria-label={rateStatus === 'loading' ? '正在刷新 USD/CNY 参考汇率' : '刷新 USD/CNY 参考汇率'}
              onClick={() => void refreshRate()}
            >{rateStatus === 'loading' ? '更新中' : '刷新汇率'}</button>
          </div>
          <div>
            <p className="m-0 mb-2 font-mono text-meta tracking-eyebrow text-muted max-phone:text-micro">LLM API · 调用成本</p>
            <h1 id="page-title" className="m-0 text-display text-ink max-phone:text-display-phone">LLM API <em className="text-primary not-italic whitespace-nowrap">成本计算器</em></h1>
          </div>
          <p className="m-0 mb-1 max-w-summary text-ui text-muted max-stack:mb-0 max-phone:text-label">维护价格方案，估算不同请求用量下的成本。</p>
        </section>

        {saveNotice && (
          <div className="-mt-1 mb-4 flex items-start gap-2.5 rounded-inset border border-warn-line bg-warn-bg px-3.5 py-3 text-label text-warn max-phone:mb-3 max-phone:px-2.5 max-phone:py-2.5 max-phone:text-meta" role="status">
            <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-brass text-ui font-bold text-on-deep" aria-hidden="true">i</span>
            <p className="m-0 flex-1">{saveNotice}</p>
            <button className="-mt-1 -mr-1 size-panel cursor-pointer border-0 bg-transparent text-symbol text-warn" type="button" aria-label="关闭提示" onClick={() => setSaveNotice('')}>×</button>
          </div>
        )}

        <ScenarioComparison
          rows={comparisonRows}
          activeId={activeId}
          limitReached={scenarioLimitReached}
          currency={currency}
          usdToCny={usdToCny}
          onSelect={(id) => dispatch({ type: 'select', id })}
          onRemove={(id) => dispatch({ type: 'remove', id })}
          onAdd={addScenario}
        />

        <section className="workbench-grid" aria-label="当前方案参数与成本">
          <section className="min-w-0 rounded-panel border border-line bg-surface px-panel pb-5 pt-panel shadow-panel max-phone:px-4 max-phone:pb-4 max-phone:pt-5" aria-labelledby="parameters-title">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="m-0 mb-1 font-mono text-meta tracking-eyebrow text-muted">当前方案</p>
                <h2 id="parameters-title" className="m-0 text-section">调用参数</h2>
              </div>
            </div>

            <label className="mt-5 mb-1.5 block text-label text-muted max-phone:mt-4" htmlFor="scenario-name">方案名称</label>
            <input
              id="scenario-name"
              className="name-field min-h-control rounded-control border border-line bg-surface px-2.5 text-value font-bold text-ink focus:border-primary focus:shadow-focus focus:outline-none"
              value={activeScenario.name}
              maxLength={32}
              onChange={(event) => dispatch({ type: 'setName', value: event.target.value })}
            />

            <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-section max-phone:mt-section max-phone:grid-cols-1 max-phone:gap-3.5">
              <ParameterField
                id="input-tokens"
                label="输入 Token"
                unit="M tokens"
                value={activeScenario.inputTokensM}
                step={1}
                error={activeParsing.ok ? undefined : activeParsing.errors.inputTokensM}
                onChange={(value) => dispatch({ type: 'setField', field: 'inputTokensM', value, usdToCny })}
                onBlur={() => commitBlank('inputTokensM')}
              />
              <ParameterField
                id="output-ratio"
                label="输出占输入比例"
                unit="%"
                value={activeScenario.outputRatioPercent}
                step={0.5}
                error={activeParsing.ok ? undefined : activeParsing.errors.outputRatioPercent}
                onChange={(value) => dispatch({ type: 'setField', field: 'outputRatioPercent', value, usdToCny })}
                onBlur={() => commitBlank('outputRatioPercent')}
              />
              <ParameterField
                id="cache-hit"
                label="缓存命中率"
                unit="%"
                value={activeScenario.cacheHitPercent}
                step={1}
                max={Math.max(0, 100 - shareCap(activeScenario.cacheWritePercent))}
                error={activeParsing.ok ? undefined : activeParsing.errors.cacheHitPercent}
                onChange={(value) => dispatch({ type: 'setField', field: 'cacheHitPercent', value, usdToCny })}
                onBlur={() => commitBlank('cacheHitPercent')}
              />
              <ParameterField
                id="cache-write"
                label="缓存写入占比"
                unit="%"
                value={activeScenario.cacheWritePercent}
                step={1}
                max={Math.max(0, 100 - shareCap(activeScenario.cacheHitPercent))}
                error={activeParsing.ok ? undefined : activeParsing.errors.cacheWritePercent}
                onChange={(value) => dispatch({ type: 'setField', field: 'cacheWritePercent', value, usdToCny })}
                onBlur={() => commitBlank('cacheWritePercent')}
              />
            </div>
            {uncachedShare !== null && (
              <p className="m-0 mt-3 text-meta text-quiet">未缓存输入占比 {uncachedShare}%</p>
            )}

            <div className="mt-panel border-t border-line-soft pt-5 max-phone:mt-5 max-phone:pt-4">
              <div className="mb-4 flex items-center justify-between gap-4 max-phone:flex-col max-phone:items-start max-phone:gap-2.5">
                <div>
                  <p className="m-0 mb-1 font-mono text-meta tracking-eyebrow text-muted">单价 / 百万 Token</p>
                  <h3 className="m-0 text-heading">模型单价</h3>
                </div>
                <div className="grid justify-items-end gap-1 max-phone:w-full max-phone:justify-items-start">
                  <span className="font-mono text-meta text-muted">{currencyUnit}</span>
                </div>
              </div>
              <ModelCatalogPicker
                selectedSource={activeScenario.modelPriceSource ?? null}
                exchangeRateAvailable={canDisplayUsd}
                onSelect={selectCatalogPrice}
                onClear={() => dispatch({ type: 'unlink' })}
              />
              <ContextPricingControls
                scenario={activeScenario}
                onCacheTtl={(id) => dispatch({ type: 'setCacheTtl', id, usdToCny })}
              />
              <div className="grid grid-cols-2 gap-3 max-phone:grid-cols-1 max-phone:gap-3">
                <ParameterField id="cached-price" label="缓存输入" compact {...priceFieldProps('cachedPrice')} />
                <ParameterField id="cache-write-price" label="缓存写入" compact {...priceFieldProps('cacheWritePrice', writePriceLocked)} />
                <ParameterField id="uncached-price" label="未缓存输入" compact {...priceFieldProps('uncachedPrice')} />
                <ParameterField id="output-price" label="输出" compact {...priceFieldProps('outputPrice')} />
              </div>
              <p className="m-0 mt-3 text-meta text-quiet">切换币种会按页面显示的参考汇率换算单价、成本和图表。</p>
            </div>
          </section>

          <CostBreakdown result={activeResult} currency={currency} usdToCny={usdToCny} />
        </section>

        <CostChart
          entries={chartEntries}
          axis={chartAxis}
          metric={chartMetric}
          cursorFraction={chartCursorFraction}
          selectedKey={selectedIntersection}
          currency={currency}
          usdToCny={usdToCny}
          onAxisChange={changeAxis}
          onMetricChange={changeMetric}
          onCursorFractionChange={setChartCursorFraction}
          onSelectIntersection={setSelectedIntersection}
        />
      </main>
    </div>
  )
}
