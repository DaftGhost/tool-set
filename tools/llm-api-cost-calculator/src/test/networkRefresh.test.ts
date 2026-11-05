import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_URL, RATE_URL, catalogPayload, draft, rawStored, storeAllCaches, storeCatalog, storeCurrency, storeScenarios, STORAGE_KEYS } from './fixtures'
import { mountApp } from './mountApp'
import { deferredRoute, jsonRoute, networkErrorRoute, rateBody, requestCount, stubFetch } from './network'
import { fieldInput, scenarioMainButton } from './queries'

const pause = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const rateRefreshButton = () => screen.getByRole('button', { name: /USD\/CNY 参考汇率/ })
const catalogRefreshButton = () => screen.getByRole('button', { name: '刷新目录' })

beforeEach(() => {
  stubFetch({})
})

describe('R4 exchange rate and model catalog requests', () => {
  it('requests the rate exactly once on open when no rate is cached', async () => {
    window.localStorage.removeItem(STORAGE_KEYS.currency)
    storeCatalog()
    const stub = stubFetch({ rate: jsonRoute(rateBody(7.2)) })

    mountApp()

    expect(await screen.findByRole('status', { name: /Frankfurter 最新参考/ })).toBeInTheDocument()
    expect(requestCount(stub, RATE_URL)).toBe(1)
    expect(requestCount(stub, CATALOG_URL)).toBe(0)
  })

  it('sends no rate or catalog request on open when both are cached', async () => {
    storeAllCaches()
    const stub = stubFetch({})

    mountApp()
    await pause(50)

    expect(stub.mock.calls).toHaveLength(0)
    expect(screen.getByRole('status', { name: /Frankfurter 本地缓存/ })).toBeInTheDocument()
  })

  it('requests the catalog exactly once on open when no catalog is cached', async () => {
    window.localStorage.removeItem(STORAGE_KEYS.catalog)
    const stub = stubFetch({ rate: jsonRoute(rateBody(7.2)), catalog: jsonRoute(catalogPayload()) })
    window.localStorage.setItem(STORAGE_KEYS.currency, JSON.stringify({ currency: 'CNY', rate: { usdToCny: 7.2, date: '2026-10-23', fetchedAt: 1 } }))

    mountApp()

    expect(await screen.findByText('已载入 111 个可选模型 · 浏览器缓存')).toBeInTheDocument()
    expect(requestCount(stub, CATALOG_URL)).toBe(1)
    expect(requestCount(stub, RATE_URL)).toBe(0)
    expect(JSON.parse(rawStored('catalog') ?? '{}').models).toHaveLength(111)
  })

  it('shows the loading state while the first rate request is pending', async () => {
    window.localStorage.removeItem(STORAGE_KEYS.currency)
    storeCatalog()
    const rate = deferredRoute(rateBody(7.2))
    stubFetch({ rate: rate.route })

    mountApp()

    expect(screen.getByText('正在获取 USD/CNY 参考汇率')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '正在获取最新日度参考汇率' })).toBeInTheDocument()
    expect(rateRefreshButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: '正在刷新 USD/CNY 参考汇率' })).toHaveTextContent('更新中')

    rate.resolve()
    expect(await screen.findByText('1 USD = 7.2 CNY · 2026-10-23')).toBeInTheDocument()
  })

  it('refreshes the rate on request, disables the button while loading and shows the new rate', async () => {
    const user = userEvent.setup()
    storeAllCaches()
    const rate = deferredRoute(rateBody(7.4, '2026-10-24'))
    const stub = stubFetch({ rate: rate.route })
    mountApp()

    await user.click(screen.getByRole('button', { name: '刷新 USD/CNY 参考汇率' }))

    expect(requestCount(stub, RATE_URL)).toBe(1)
    expect(screen.getByRole('button', { name: '正在刷新 USD/CNY 参考汇率' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '正在刷新 USD/CNY 参考汇率' })).toHaveTextContent('更新中')
    expect(screen.getByRole('status', { name: /正在刷新，当前使用缓存 · 1 USD = 7.2 CNY · 数据日期 2026-10-23/ })).toBeInTheDocument()

    rate.resolve()

    expect(await screen.findByText('1 USD = 7.4 CNY · 2026-10-24')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: /Frankfurter 最新参考 · 1 USD = 7.4 CNY · 数据日期 2026-10-24/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新 USD/CNY 参考汇率' })).toBeEnabled()
    expect(requestCount(stub, RATE_URL)).toBe(1)
  })

  it('keeps the cached rate when a refresh fails', async () => {
    const user = userEvent.setup()
    storeAllCaches()
    const before = rawStored('currency')
    stubFetch({ rate: jsonRoute({ error: 'unavailable' }, 503) })
    mountApp()

    await user.click(screen.getByRole('button', { name: '刷新 USD/CNY 参考汇率' }))

    expect(await screen.findByRole('status', { name: /Frankfurter 本地缓存 · 1 USD = 7.2 CNY/ })).toBeInTheDocument()
    expect(screen.getByText('1 USD = 7.2 CNY · 2026-10-23')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'USD' })).toBeEnabled()
    expect(rawStored('currency')).toBe(before)
  })

  it('keeps CNY usable and USD disabled when no rate is cached and the request fails', async () => {
    window.localStorage.removeItem(STORAGE_KEYS.currency)
    storeCatalog()
    stubFetch({ rate: networkErrorRoute() })
    mountApp()

    expect(await screen.findByText('USD/CNY 汇率暂不可用')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '暂时无法获取汇率，人民币模式仍可使用' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'USD' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'CNY' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '刷新 USD/CNY 参考汇率' })).toBeEnabled()
    expect(within(screen.getByRole('region', { name: '成本拆分' })).queryByText('完善左侧参数后，这里会显示成本拆分。')).toBeNull()
    expect(within(screen.getByRole('region', { name: '成本拆分' })).getByText('预估总成本').parentElement).toHaveTextContent('¥12.61')
  })

  it('starts only one rate request for two rapid refresh clicks', async () => {
    storeAllCaches()
    const rate = deferredRoute(rateBody(7.2))
    const stub = stubFetch({ rate: rate.route })
    mountApp()

    const button = rateRefreshButton()
    fireEvent.click(button)
    fireEvent.click(button)

    expect(requestCount(stub, RATE_URL)).toBe(1)
    rate.resolve()
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新 USD/CNY 参考汇率' })).toBeEnabled())
    expect(requestCount(stub, RATE_URL)).toBe(1)
  })

  it('sends one catalog request for two rapid 刷新目录 clicks (in-flight guard added by the React rewrite)', async () => {
    storeAllCaches()
    const stub = stubFetch({ catalog: jsonRoute(catalogPayload()) })
    mountApp()

    fireEvent.click(catalogRefreshButton())
    fireEvent.click(catalogRefreshButton())

    await waitFor(() => expect(screen.getByText('已载入 111 个可选模型 · 浏览器缓存')).toBeInTheDocument())
    expect(requestCount(stub, CATALOG_URL)).toBe(1)
  })

  it('keeps the model list and reports a failed catalog refresh', async () => {
    const user = userEvent.setup()
    storeAllCaches()
    stubFetch({ catalog: jsonRoute({}, 503) })
    mountApp()

    await user.click(catalogRefreshButton())

    expect(await screen.findByText('刷新失败，继续使用当前模型目录。')).toBeInTheDocument()
    expect(screen.queryByText(/已载入/)).toBeNull()
    await user.type(screen.getByRole('combobox', { name: '选择模型定价' }), 'qwen')
    expect(screen.getByRole('option', { name: /Qwen Plus/ })).toBeInTheDocument()
  })

  it('reports a failed first catalog request and disables the search box', async () => {
    window.localStorage.removeItem(STORAGE_KEYS.catalog)
    storeCurrency('CNY')
    stubFetch({ catalog: jsonRoute({}, 500) })
    mountApp()

    expect(await screen.findByText('目录暂时无法载入；现有方案仍可继续使用。')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '选择模型定价' })).toBeDisabled()
  })

  it('reprices linked scenarios with the new rate and leaves unlinked scenarios unchanged', async () => {
    const user = userEvent.setup()
    const gpt4o = {
      providerId: 'openai',
      providerName: 'OpenAI',
      modelId: 'gpt-4o',
      modelName: 'GPT-4o',
      inputUsdPerMillion: 2.5,
      cacheReadUsdPerMillion: 1.25,
      outputUsdPerMillion: 10,
      lastUpdated: '2025-05-01',
    }
    storeScenarios([
      draft('linked', 'OpenAI · GPT-4o', { cachedPrice: '9', uncachedPrice: '18', outputPrice: '72', modelPriceSource: gpt4o }),
      draft('free', '自定义', { cachedPrice: '0.5', uncachedPrice: '3', outputPrice: '9' }),
    ], 'free')
    storeCurrency('CNY', { usdToCny: 7.2, date: '2026-10-23', fetchedAt: 1_790_000_000_000 })
    storeCatalog()
    stubFetch({ rate: jsonRoute(rateBody(7.5, '2026-10-24')) })
    mountApp()

    await user.click(screen.getByRole('button', { name: '刷新 USD/CNY 参考汇率' }))
    expect(await screen.findByText('1 USD = 7.5 CNY · 2026-10-24')).toBeInTheDocument()

    await user.click(scenarioMainButton('OpenAI · GPT-4o'))
    expect(fieldInput('缓存输入')).toHaveValue('9.375')
    expect(fieldInput('未缓存输入')).toHaveValue('18.75')
    expect(fieldInput('输出')).toHaveValue('75')

    await user.click(scenarioMainButton('自定义'))
    expect(fieldInput('缓存输入')).toHaveValue('0.5')
    expect(fieldInput('未缓存输入')).toHaveValue('3')
    expect(fieldInput('输出')).toHaveValue('9')
  })
})
