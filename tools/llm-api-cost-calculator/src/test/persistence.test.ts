import { screen, waitFor } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  catalogPayload,
  draft,
  exampleOne,
  exampleTwo,
  rawStored,
  RATE_DATE,
  storeAllCaches,
  storeCatalog,
  storeCurrency,
  storeScenarios,
  STORAGE_KEYS,
} from './fixtures'
import { mountApp } from './mountApp'
import { jsonRoute, rateBody, stubFetch } from './network'
import { fieldInput, scenarioCard, scenarioMainButton } from './queries'

const UNREADABLE_NOTICE = '上次的方案无法读取，已载入示例方案。修改并保存后，可以继续使用新方案。'
const SAVE_FAILED_NOTICE = '方案未能保存，离开页面后这些修改可能丢失。请检查可用空间后重试。'
const UNAVAILABLE_NOTICE = '无法保存方案；离开页面后，当前修改可能丢失。'
const UNREADABLE_SAVE = JSON.stringify({ version: 2, scenarios: [] })

beforeEach(() => {
  stubFetch({})
})

afterEach(() => {
  vi.useRealTimers()
})

function snapshotAll(): Record<string, string | null> {
  return {
    scenarios: rawStored('scenarios'),
    currency: rawStored('currency'),
    catalog: rawStored('catalog'),
  }
}

const pause = (ms: number) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

describe('R3 local data compatibility and saving', () => {
  it('loads a stored version 1 save with its scenarios, active scenario and values', () => {
    storeScenarios([
      draft('alpha', 'Alpha', { inputTokensM: '12.5', cacheHitPercent: '30', outputRatioPercent: '80', cachedPrice: '0.5', uncachedPrice: '3', outputPrice: '9' }),
      draft('beta', 'Beta', { inputTokensM: '7', cacheHitPercent: '60', outputRatioPercent: '10', cachedPrice: '0.25', uncachedPrice: '1.5', outputPrice: '2' }),
    ], 'beta')
    storeCurrency('CNY')
    storeCatalog()
    const before = rawStored('scenarios')

    mountApp()

    expect(scenarioMainButton('Beta')).toHaveAttribute('aria-pressed', 'true')
    expect(scenarioMainButton('Alpha')).toHaveAttribute('aria-pressed', 'false')
    expect(fieldInput('方案名称')).toHaveValue('Beta')
    expect(fieldInput('输入 Token')).toHaveValue('7')
    expect(fieldInput('缓存命中率')).toHaveValue('60')
    expect(fieldInput('缓存输入')).toHaveValue('0.25')
    expect(scenarioCard('Alpha')).toHaveTextContent('输入 12.5M缓存 30%输出比 80%')
    expect(rawStored('scenarios')).toBe(before)
  })

  it('leaves every stored value byte-identical when the page is opened and not edited', async () => {
    storeAllCaches()
    const before = snapshotAll()

    mountApp()
    expect(screen.getByText('已保存')).toBeInTheDocument()
    // Longer than the 350 ms save debounce, so a write triggered on open would have happened.
    await pause(500)

    expect(snapshotAll()).toStrictEqual(before)
    expect(screen.queryByText('正在保存')).toBeNull()
  })

  it('keeps an unreadable stored save untouched and shows the notice until the user edits', async () => {
    const user = userEvent.setup()
    storeCurrency('CNY')
    storeCatalog()
    window.localStorage.setItem(STORAGE_KEYS.scenarios, UNREADABLE_SAVE)

    mountApp()

    expect(screen.getByText(UNREADABLE_NOTICE)).toBeInTheDocument()
    expect(scenarioCard('方案 1')).toBeInTheDocument()
    expect(screen.queryByText('已保存')).toBeNull()

    await pause(500)
    expect(rawStored('scenarios')).toBe(UNREADABLE_SAVE)

    await user.type(fieldInput('方案名称'), 'X')

    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument(), { timeout: 2000 })
    expect(screen.queryByText(UNREADABLE_NOTICE)).toBeNull()
    expect(rawStored('scenarios')).not.toBe(UNREADABLE_SAVE)
    expect(JSON.parse(rawStored('scenarios') ?? '{}')).toMatchObject({ version: 1, activeId: 'example-1' })
  })

  it('reports 正在保存 and then 已保存 about 350 ms after an edit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime, delay: null })
    storeAllCaches([exampleOne(), exampleTwo()])
    const before = rawStored('scenarios')
    mountApp()

    await user.type(fieldInput('方案名称'), 'X')
    expect(screen.getByText('正在保存')).toBeInTheDocument()
    expect(rawStored('scenarios')).toBe(before)

    vi.advanceTimersByTime(349)
    expect(rawStored('scenarios')).toBe(before)
    expect(screen.getByText('正在保存')).toBeInTheDocument()

    vi.advanceTimersByTime(1)
    await vi.advanceTimersByTimeAsync(0)

    expect(screen.getByText('已保存')).toBeInTheDocument()
    expect(JSON.parse(rawStored('scenarios') ?? '{}').scenarios[0].name).toBe('方案 1X')
  })

  it('shows 保存失败 and the save notice when the write throws', async () => {
    const user = userEvent.setup()
    storeAllCaches()
    const before = rawStored('scenarios')
    mountApp()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })

    await user.type(fieldInput('方案名称'), 'X')

    expect(await screen.findByText('保存失败', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByText(SAVE_FAILED_NOTICE)).toBeInTheDocument()
    expect(rawStored('scenarios')).toBe(before)
  })

  it('shows 无法保存 when localStorage cannot be read, and 保存失败 after an edit', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    stubFetch({ rate: jsonRoute(rateBody(7.2)), catalog: jsonRoute(catalogPayload()) })
    mountApp()

    expect(screen.getByText('无法保存')).toBeInTheDocument()
    expect(screen.getByText(UNAVAILABLE_NOTICE)).toBeInTheDocument()
    expect(scenarioCard('方案 1')).toBeInTheDocument()
    expect(await screen.findByRole('status', { name: /设置未能保存/ })).toBeInTheDocument()

    await user.type(fieldInput('方案名称'), 'X')

    expect(await screen.findByText('保存失败', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByText(SAVE_FAILED_NOTICE)).toBeInTheDocument()
  })

  it('closes the storage notice with its close button without writing anything', async () => {
    const user = userEvent.setup()
    storeCurrency('CNY')
    storeCatalog()
    window.localStorage.setItem(STORAGE_KEYS.scenarios, UNREADABLE_SAVE)
    mountApp()

    await user.click(screen.getByRole('button', { name: '关闭提示' }))

    expect(screen.queryByText(UNREADABLE_NOTICE)).toBeNull()
    expect(rawStored('scenarios')).toBe(UNREADABLE_SAVE)
  })

  it('writes the currency preference and rate snapshot when the rate first arrives and when either changes', async () => {
    const user = userEvent.setup()
    storeCatalog()
    const bodies = [rateBody(7.2), rateBody(7.5, '2026-10-24')]
    let requests = 0
    stubFetch({
      rate: () => jsonRoute(bodies[Math.min(requests++, bodies.length - 1)])(),
    })
    mountApp()

    await waitFor(() => expect(rawStored('currency')).not.toBeNull())
    expect(JSON.parse(rawStored('currency') ?? '{}')).toStrictEqual({
      currency: 'CNY',
      rate: { usdToCny: 7.2, date: RATE_DATE, fetchedAt: expect.any(Number) },
    })
    expect(rawStored('scenarios')).toBeNull()

    await user.click(await screen.findByRole('button', { name: 'USD' }))
    expect(JSON.parse(rawStored('currency') ?? '{}').currency).toBe('USD')

    await user.click(screen.getByRole('button', { name: '刷新 USD/CNY 参考汇率' }))
    await waitFor(() => expect(JSON.parse(rawStored('currency') ?? '{}').rate.usdToCny).toBe(7.5))
    expect(JSON.parse(rawStored('currency') ?? '{}')).toMatchObject({
      currency: 'USD',
      rate: { date: '2026-10-24' },
    })
  })
})
