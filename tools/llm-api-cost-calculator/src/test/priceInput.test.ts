import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { draft, exampleOne, exampleTwo, storeAllCaches, storeCatalog, storeCurrency, storeScenarios } from './fixtures'
import { mountApp } from './mountApp'
import { deferredRoute, rateBody, stubFetch } from './network'
import { fieldInput, scenarioCard } from './queries'

const linkedGpt4o = {
  providerId: 'openai',
  providerName: 'OpenAI',
  modelId: 'gpt-4o',
  modelName: 'GPT-4o',
  inputUsdPerMillion: 2.5,
  cacheReadUsdPerMillion: 1.25,
  outputUsdPerMillion: 10,
  lastUpdated: '2025-05-01',
}

beforeEach(() => {
  stubFetch({})
})

// Two scenarios whose USD values are whole numbers at 7.2 CNY per USD.
const usdFriendly = () => draft('usd-1', '方案 1', { cachedPrice: '7.2', uncachedPrice: '14.4', outputPrice: '36' })

describe('R5 price fields, currency switch and catalog selection', () => {
  it('keeps the raw text while a price field is focused and normalises it on blur', async () => {
    const user = userEvent.setup()
    storeAllCaches([usdFriendly()], 'USD')
    mountApp()

    const cached = fieldInput('缓存输入')
    expect(cached).toHaveValue('1')
    await user.clear(cached)
    await user.type(cached, '1.50')
    expect(cached).toHaveValue('1.50')

    await user.tab()
    expect(cached).toHaveValue('1.5')
  })

  it('drops the raw text when the currency is switched', async () => {
    const user = userEvent.setup()
    storeAllCaches([usdFriendly()], 'USD')
    mountApp()

    await user.clear(fieldInput('缓存输入'))
    await user.type(fieldInput('缓存输入'), '1.50')
    // fireEvent keeps focus in the price field, so the draft is dropped by the currency change itself.
    fireEvent.click(screen.getByRole('button', { name: 'CNY' }))
    await waitFor(() => expect(fieldInput('缓存输入')).toHaveValue('10.8'))

    await user.click(screen.getByRole('button', { name: 'USD' }))
    expect(fieldInput('缓存输入')).toHaveValue('1.5')
  })

  it('drops the raw text when the rate is refreshed', async () => {
    const user = userEvent.setup()
    storeAllCaches([usdFriendly()], 'USD')
    const rate = deferredRoute(rateBody(7.2, '2026-10-24'))
    stubFetch({ rate: rate.route })
    mountApp()

    await user.clear(fieldInput('缓存输入'))
    await user.type(fieldInput('缓存输入'), '1.50')
    expect(fieldInput('缓存输入')).toHaveValue('1.50')

    // fireEvent keeps focus in the price field; a real click would blur it first and drop the draft.
    fireEvent.click(screen.getByRole('button', { name: '刷新 USD/CNY 参考汇率' }))
    expect(fieldInput('缓存输入')).toHaveValue('1.50')

    rate.resolve()
    await waitFor(() => expect(screen.getByText('1 USD = 7.2 CNY · 2026-10-24')).toBeInTheDocument())
    expect(fieldInput('缓存输入')).toHaveValue('1.5')
  })

  it('fills the name, converts the catalog prices and makes the price fields read-only', async () => {
    const user = userEvent.setup()
    storeAllCaches([exampleOne(), exampleTwo()], 'CNY')
    mountApp()

    await user.type(screen.getByRole('combobox', { name: '选择模型定价' }), 'gpt-4o')
    await user.click(screen.getByRole('option', { name: /OpenAI.*GPT-4o/ }))

    expect(fieldInput('方案名称')).toHaveValue('OpenAI · GPT-4o')
    expect(scenarioCard('OpenAI · GPT-4o')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '选择模型定价' })).toHaveValue('OpenAI - GPT-4o')
    expect(fieldInput('缓存输入')).toHaveValue('9')
    expect(fieldInput('未缓存输入')).toHaveValue('18')
    expect(fieldInput('输出')).toHaveValue('72')
    for (const label of ['缓存输入', '未缓存输入', '输出']) {
      expect(fieldInput(label)).toHaveAttribute('readonly')
      expect(screen.queryByRole('button', { name: `增加${label}` })).toBeNull()
    }
    expect(screen.getByText('已关联 OpenAI · GPT-4o')).toBeInTheDocument()
    expect(screen.getByText('目录标注更新：2025-05-01')).toBeInTheDocument()
  })

  it('shows linked prices in USD as the catalog USD values', async () => {
    const user = userEvent.setup()
    storeAllCaches([exampleOne()], 'USD')
    mountApp()

    await user.type(screen.getByRole('combobox', { name: '选择模型定价' }), 'gpt-4o')
    await user.click(screen.getByRole('option', { name: /OpenAI.*GPT-4o/ }))

    expect(fieldInput('缓存输入')).toHaveValue('1.25')
    expect(fieldInput('未缓存输入')).toHaveValue('2.5')
    expect(fieldInput('输出')).toHaveValue('10')
  })

  it('truncates the name filled from a long catalog entry to 32 characters', async () => {
    const user = userEvent.setup()
    storeAllCaches([exampleOne()], 'CNY')
    mountApp()

    await user.type(screen.getByRole('combobox', { name: '选择模型定价' }), 'Very Long')
    await user.click(screen.getByRole('option', { name: /Very Long Provider/ }))

    // "Very Long Provider Name Company Limited · Model" cut to 32 characters, including the trailing space.
    expect(fieldInput('方案名称')).toHaveValue('Very Long Provider Name Company ')
    expect(within(scenarioCard('Very Long Provider Name Company')).getByText('Very Long Provider Name Company')).toBeInTheDocument()
    expect(fieldInput('缓存输入')).toHaveValue('3.6')
    expect(fieldInput('未缓存输入')).toHaveValue('7.2')
    expect(fieldInput('输出')).toHaveValue('14.4')
  })

  it('keeps the values when the model association is cleared and makes the fields editable again', async () => {
    const user = userEvent.setup()
    storeScenarios([draft('linked', '方案 1', { cachedPrice: '9', uncachedPrice: '18', outputPrice: '72', modelPriceSource: linkedGpt4o })])
    storeCurrency('CNY')
    storeCatalog()
    mountApp()

    expect(fieldInput('缓存输入')).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: '切换为自定义价格' }))

    expect(fieldInput('缓存输入')).toHaveValue('9')
    expect(fieldInput('未缓存输入')).toHaveValue('18')
    expect(fieldInput('输出')).toHaveValue('72')
    expect(fieldInput('缓存输入')).not.toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: '增加缓存输入' })).toBeInTheDocument()
    expect(screen.queryByText(/已关联/)).toBeNull()
    expect(fieldInput('选择模型定价')).toHaveValue('')
  })

})
