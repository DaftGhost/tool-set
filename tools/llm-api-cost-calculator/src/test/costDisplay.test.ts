import { screen, waitFor, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { cachedRate, draft, STORAGE_KEYS, storeCatalog, storeCurrency, storeScenarios } from './fixtures'
import { mountApp } from './mountApp'
import { deferredRoute, jsonRoute, rateBody, stubFetch } from './network'
import { costLineText, fieldInput, scenarioCard, summaryPanel } from './queries'

beforeEach(() => {
  storeCurrency('CNY')
  storeCatalog()
  stubFetch({})
})

async function typeInto(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = fieldInput(label)
  await user.clear(input)
  if (value !== '') await user.type(input, value)
}

describe('R1 cost calculation and display', () => {
  it('renders the two example scenarios with exact costs and the cheapest marker', () => {
    mountApp()

    expect(scenarioCard('方案 1')).toHaveTextContent('¥13.755')
    expect(scenarioCard('方案 1')).toHaveTextContent('输入 100M缓存 97%输出比 1%')
    expect(scenarioCard('方案 2')).toHaveTextContent('¥11.94')
    expect(within(scenarioCard('方案 2')).getByText('最低')).toBeInTheDocument()
    expect(within(scenarioCard('方案 1')).queryByText('最低')).toBeNull()

    expect(fieldInput('方案名称')).toHaveValue('方案 1')
    expect(fieldInput('输入 Token')).toHaveValue('100')
    expect(fieldInput('缓存命中率')).toHaveValue('97')
    expect(fieldInput('输出占输入比例')).toHaveValue('1')
    expect(fieldInput('缓存输入')).toHaveValue('0.115')
    expect(fieldInput('未缓存输入')).toHaveValue('0.4')
    expect(fieldInput('输出')).toHaveValue('1.4')
    expect(screen.getByText('CNY / M tokens')).toBeInTheDocument()
    expect(screen.getByText('CNY / 请求')).toBeInTheDocument()
  })

  it('shows the cost breakdown of the active example scenario', () => {
    mountApp()
    const summary = summaryPanel()

    expect(within(summary).getByText('预估总成本').parentElement).toHaveTextContent(/^预估总成本¥13\.755$/)
    expect(within(summary).getByRole('img', { name: '缓存输入 ¥11.155，未缓存输入 ¥1.20，输出 ¥1.40' })).toBeInTheDocument()
    expect(costLineText('输入成本')).toBe('输入成本100M tokens¥12.355')
    expect(costLineText('缓存命中')).toBe('缓存命中97M tokens¥11.155')
    expect(costLineText('未缓存输入')).toBe('未缓存输入3M tokens¥1.20')
    expect(costLineText('输出成本')).toBe('输出成本1M tokens¥1.40')
    expect(within(summary).getByText('估算 · 单次请求')).toBeInTheDocument()
  })

  it('recalculates a valid custom input and updates the comparison card', async () => {
    const user = userEvent.setup()
    mountApp()

    await typeInto(user, '输入 Token', '2.5')
    await typeInto(user, '缓存命中率', '40')
    await typeInto(user, '输出占输入比例', '50')
    await typeInto(user, '缓存输入', '0.3')
    await typeInto(user, '未缓存输入', '1.2')
    await typeInto(user, '输出', '6')

    const summary = summaryPanel()
    expect(within(summary).getByText('预估总成本').parentElement).toHaveTextContent(/^预估总成本¥9\.60$/)
    expect(costLineText('输入成本')).toBe('输入成本2.5M tokens¥2.10')
    expect(costLineText('缓存命中')).toBe('缓存命中1M tokens¥0.30')
    expect(costLineText('未缓存输入')).toBe('未缓存输入1.5M tokens¥1.80')
    expect(costLineText('输出成本')).toBe('输出成本1.25M tokens¥7.50')
    expect(scenarioCard('方案 1')).toHaveTextContent('¥9.60')
    expect(scenarioCard('方案 1')).toHaveTextContent('输入 2.5M缓存 40%输出比 50%')
    expect(fieldInput('输入 Token')).toHaveAttribute('aria-invalid', 'false')
  })

  it('shows per-field errors and the placeholder for negative tokens and an empty price', async () => {
    const user = userEvent.setup()
    mountApp()

    await typeInto(user, '输入 Token', '-5')
    await typeInto(user, '缓存输入', '')

    expect(fieldInput('输入 Token')).toHaveAttribute('aria-invalid', 'true')
    expect(fieldInput('输入 Token')).toHaveAccessibleDescription('请输入非负数字')
    expect(fieldInput('缓存输入')).toHaveAccessibleDescription('请输入非负数字')
    expect(fieldInput('未缓存输入')).toHaveAttribute('aria-invalid', 'false')
    expect(within(summaryPanel()).getByText('完善左侧参数后，这里会显示成本拆分。')).toBeInTheDocument()
    expect(within(summaryPanel()).queryByText('预估总成本')).toBeNull()
    expect(within(scenarioCard('方案 1')).getByText('参数待修正')).toBeInTheDocument()
    expect(within(scenarioCard('方案 1')).getByText('请输入非负数字')).toBeInTheDocument()
    expect(scenarioCard('方案 1')).toHaveTextContent('输入 -5M')
    expect(scenarioCard('方案 2')).toHaveTextContent('¥11.94')
  })

  it('reports the cache-hit range error and shows the first error of the card', async () => {
    const user = userEvent.setup()
    mountApp()

    await typeInto(user, '缓存命中率', '101')
    await typeInto(user, '未缓存输入', '')

    expect(fieldInput('缓存命中率')).toHaveAccessibleDescription('缓存命中率不能超过 100%')
    expect(fieldInput('未缓存输入')).toHaveAccessibleDescription('请输入非负数字')
    expect(within(summaryPanel()).getByText('完善左侧参数后，这里会显示成本拆分。')).toBeInTheDocument()
    // The card shows the first error in insertion order; the empty price is recorded before the cache error.
    expect(within(scenarioCard('方案 1')).getByText('参数待修正')).toBeInTheDocument()
    expect(within(scenarioCard('方案 1')).getByText('请输入非负数字')).toBeInTheDocument()
    expect(within(scenarioCard('方案 1')).queryByText('缓存命中率不能超过 100%')).toBeNull()
  })

  it('converts prices and costs to USD without changing token counts or the name', async () => {
    const user = userEvent.setup()
    storeScenarios([draft('converted', '转换示例', { cachedPrice: '7.2', uncachedPrice: '14.4', outputPrice: '36' })])
    storeCurrency('CNY', cachedRate)
    mountApp()

    expect(costLineText('输入成本')).toBe('输入成本100M tokens¥741.60')
    expect(costLineText('缓存命中')).toBe('缓存命中97M tokens¥698.40')
    expect(within(summaryPanel()).getByText('预估总成本').parentElement).toHaveTextContent(/^预估总成本¥777\.60$/)

    await user.click(screen.getByRole('button', { name: 'USD' }))

    expect(screen.getByRole('button', { name: 'USD' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'CNY' })).toHaveAttribute('aria-pressed', 'false')
    expect(fieldInput('缓存输入')).toHaveValue('1')
    expect(fieldInput('未缓存输入')).toHaveValue('2')
    expect(fieldInput('输出')).toHaveValue('5')
    expect(screen.getAllByText('$ / M')).toHaveLength(3)
    // The catalog options also contain "USD / M tokens", so search inside the 模型单价 heading's section.
    const priceHeading = screen.getByRole('heading', { name: '模型单价' })
    expect(within(priceHeading.parentElement!.parentElement!).getByText('USD / M tokens')).toBeInTheDocument()
    expect(screen.getByText('USD / 请求')).toBeInTheDocument()
    expect(costLineText('输入成本')).toBe('输入成本100M tokensUS$103.00')
    expect(costLineText('缓存命中')).toBe('缓存命中97M tokensUS$97.00')
    expect(costLineText('未缓存输入')).toBe('未缓存输入3M tokensUS$6.00')
    expect(costLineText('输出成本')).toBe('输出成本1M tokensUS$5.00')
    expect(within(summaryPanel()).getByText('预估总成本').parentElement).toHaveTextContent(/^预估总成本US\$108\.00$/)
    expect(scenarioCard('转换示例')).toHaveTextContent('US$108.00')
    expect(fieldInput('方案名称')).toHaveValue('转换示例')
    expect(fieldInput('输入 Token')).toHaveValue('100')

    await user.click(screen.getByRole('button', { name: 'CNY' }))
    expect(fieldInput('缓存输入')).toHaveValue('7.2')
    expect(fieldInput('未缓存输入')).toHaveValue('14.4')
    expect(fieldInput('输出')).toHaveValue('36')
  })

  it('keeps the USD button disabled until a rate is available', async () => {
    window.localStorage.removeItem(STORAGE_KEYS.currency)
    const rate = deferredRoute(rateBody(7.2))
    stubFetch({ rate: rate.route, catalog: jsonRoute({}, 500) })
    mountApp()

    const usd = screen.getByRole('button', { name: 'USD' })
    expect(usd).toBeDisabled()
    expect(usd).toHaveAttribute('title', '获取汇率后可切换美元')

    rate.resolve()
    await waitFor(() => expect(screen.getByRole('button', { name: 'USD' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'USD' })).toHaveAttribute('title', '显示美元金额')
  })
})
