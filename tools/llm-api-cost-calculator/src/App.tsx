import { useState } from 'react'
import { CostBreakdown } from './components/CostBreakdown'
import { CostChart } from './components/CostChart'
import { ModelCatalogPicker } from './components/ModelCatalogPicker'
import { ParameterField } from './components/ParameterField'
import { ScenarioComparison } from './components/ScenarioComparison'
import type { ComparisonRow } from './components/ScenarioComparison'
import { calculateCost, formatNumber, parseScenarioDraft } from './domain/cost'
import type { ModelPriceSource } from './domain/cost'
import { convertPriceInputToCny, displayPriceInput } from './domain/currency'
import type { CurrencyCode } from './domain/currency'
import type { ChartAxis, CostMetric } from './domain/chart'
import { MAX_SCENARIOS, cloneScenario } from './domain/scenarios'
import { useExchangeRate } from './useExchangeRate'
import { activeIndexOf, useScenarioState } from './useScenarioState'

type PriceField = 'cachedPrice' | 'uncachedPrice' | 'outputPrice'
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
  const saveStatusClass = ['save-status', saveStatusError && 'status-error', saveStatus === 'saving' && 'status-saving']
    .filter(Boolean).join(' ')

  function priceInputValue(field: PriceField): string {
    const draft = priceInputDrafts[activeId]?.[field]
    return draft ?? displayPriceInput(activeScenario[field], currency, usdToCny)
  }

  function updatePriceField(field: PriceField, value: string) {
    setPriceInputDrafts((drafts) => ({
      ...drafts,
      [activeId]: { ...drafts[activeId], [field]: value },
    }))
    dispatch({ type: 'setField', field, value: convertPriceInputToCny(value, currency, usdToCny) })
  }

  function finishPriceEdit(...fields: PriceField[]) {
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
    finishPriceEdit('cachedPrice', 'uncachedPrice', 'outputPrice')
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

  const priceFieldProps = (field: PriceField) => ({
    unit: currency === 'USD' ? '$ / M' : '¥ / M',
    value: priceInputValue(field),
    readOnly: Boolean(activeScenario.modelPriceSource),
    step: 0.01,
    error: activeParsing.ok ? undefined : activeParsing.errors[field],
    onChange: (value: string) => updatePriceField(field, value),
    onBlur: () => finishPriceEdit(field),
  })

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Token Cost 首页">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">token<span>cost</span></span>
        </a>
        <div className="topbar-tools">
          <a className="catalog-link" href="../../">所有工具</a>
          <div className="currency-switch" role="group" aria-label="金额显示币种">
            <button type="button" aria-pressed={currency === 'CNY'} onClick={() => selectCurrency('CNY')}>CNY</button>
            <button
              type="button"
              aria-pressed={currency === 'USD'}
              disabled={!canDisplayUsd}
              title={canDisplayUsd ? '显示美元金额' : '获取汇率后可切换美元'}
              onClick={() => selectCurrency('USD')}
            >USD</button>
          </div>
          {saveStatusText && (
            <div className={saveStatusClass} aria-live="polite">
              <span className="save-dot" />
              <span>{saveStatusText}</span>
            </div>
          )}
        </div>
      </header>

      <main id="top" className="main-content">
        <section className="page-intro" aria-labelledby="page-title">
          <div className="rate-status-row">
            <span
              className={`rate-status rate-${rateStatus}`}
              role="status"
              aria-label={exchangeRateLabel}
              title={exchangeRateLabel}
            >{exchangeRateSummary}</span>
            <button
              className="rate-refresh"
              type="button"
              disabled={rateStatus === 'loading'}
              aria-label={rateStatus === 'loading' ? '正在刷新 USD/CNY 参考汇率' : '刷新 USD/CNY 参考汇率'}
              onClick={() => void refreshRate()}
            >{rateStatus === 'loading' ? '更新中' : '刷新汇率'}</button>
          </div>
          <div>
            <p className="eyebrow">LLM API · 调用成本</p>
            <h1 id="page-title">LLM API <em>成本计算器</em></h1>
          </div>
          <p className="intro-copy">维护价格方案，估算不同请求用量下的成本。</p>
        </section>

        {saveNotice && (
          <div className="storage-notice" role="status">
            <span className="notice-icon" aria-hidden="true">i</span>
            <p>{saveNotice}</p>
            <button type="button" aria-label="关闭提示" onClick={() => setSaveNotice('')}>×</button>
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
          <section className="parameter-panel surface" aria-labelledby="parameters-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">当前方案</p>
                <h2 id="parameters-title">调用参数</h2>
              </div>
            </div>

            <label className="scenario-name-label" htmlFor="scenario-name">方案名称</label>
            <input
              id="scenario-name"
              className="scenario-name-input"
              value={activeScenario.name}
              maxLength={32}
              onChange={(event) => dispatch({ type: 'setName', value: event.target.value })}
            />

            <div className="parameter-list">
              <ParameterField
                id="input-tokens"
                label="输入 Token"
                unit="M tokens"
                value={activeScenario.inputTokensM}
                step={1}
                error={activeParsing.ok ? undefined : activeParsing.errors.inputTokensM}
                onChange={(value) => dispatch({ type: 'setField', field: 'inputTokensM', value })}
              />
              <ParameterField
                id="cache-hit"
                label="缓存命中率"
                unit="%"
                value={activeScenario.cacheHitPercent}
                step={1}
                max={100}
                error={activeParsing.ok ? undefined : activeParsing.errors.cacheHitPercent}
                onChange={(value) => dispatch({ type: 'setField', field: 'cacheHitPercent', value })}
              />
              <ParameterField
                id="output-ratio"
                label="输出占输入比例"
                unit="%"
                value={activeScenario.outputRatioPercent}
                step={0.5}
                error={activeParsing.ok ? undefined : activeParsing.errors.outputRatioPercent}
                onChange={(value) => dispatch({ type: 'setField', field: 'outputRatioPercent', value })}
              />
            </div>

            <div className="price-section">
              <div className="price-heading">
                <div>
                  <p className="eyebrow">单价 / 百万 Token</p>
                  <h3>模型单价</h3>
                </div>
                <div className="price-meta">
                  <span className="price-unit-label">{currencyUnit}</span>
                </div>
              </div>
              <ModelCatalogPicker
                selectedSource={activeScenario.modelPriceSource ?? null}
                exchangeRateAvailable={canDisplayUsd}
                onSelect={selectCatalogPrice}
                onClear={() => dispatch({ type: 'unlink' })}
              />
              <div className="price-fields">
                <ParameterField id="cached-price" label="缓存输入" {...priceFieldProps('cachedPrice')} />
                <ParameterField id="uncached-price" label="未缓存输入" {...priceFieldProps('uncachedPrice')} />
                <ParameterField id="output-price" label="输出" {...priceFieldProps('outputPrice')} />
              </div>
              <p className="parameter-note">切换币种会按页面显示的参考汇率换算单价、成本和图表。</p>
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
