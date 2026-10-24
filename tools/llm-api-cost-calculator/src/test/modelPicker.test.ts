import { screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { catalogPayload, exampleOne, STORAGE_KEYS, storeAllCaches, storeCatalog, storeCurrency } from './fixtures'
import { mountApp } from './mountApp'
import { jsonRoute, networkErrorRoute, stubFetch } from './network'
import { fieldInput } from './queries'

const search = () => screen.getByRole('combobox', { name: '选择模型定价' }) as HTMLInputElement
const optionTexts = () => screen.queryAllByRole('option').map((option) => option.textContent)

beforeEach(() => {
  stubFetch({})
})

describe('R5 model search box and catalog results', () => {
  it('filters case-insensitively by provider, model name and ids', async () => {
    const user = userEvent.setup()
    storeAllCaches()
    mountApp()

    await user.type(search(), 'GPT')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(optionTexts()[0]).toContain('OpenAI')
    expect(optionTexts()[1]).toContain('OpenRouter')

    await user.clear(search())
    await user.type(search(), 'alibaba-cn')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(optionTexts()[0]).toContain('Qwen Plus')

    await user.clear(search())
    await user.type(search(), 'latest')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(optionTexts()[0]).toContain('Alibaba Cloud')

    await user.clear(search())
    await user.type(search(), 'zzz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('没有匹配的模型；试试模型 ID 或厂商名称。')).toBeInTheDocument()
  })

  it('lists catalog entries in stored order, badges only first-party providers and shows USD prices', async () => {
    const user = userEvent.setup()
    storeAllCaches()
    mountApp()

    await user.type(search(), 'openai')
    const [gpt4o, o3mini] = screen.getAllByRole('option')
    expect(gpt4o).toHaveTextContent('OpenAI')
    expect(gpt4o).toHaveTextContent('厂商直供')
    expect(gpt4o).toHaveTextContent('输入 $2.5')
    expect(gpt4o).toHaveTextContent('输出 $10')
    expect(gpt4o).toHaveTextContent('USD / M tokens')
    expect(o3mini).toHaveTextContent('o3-mini')

    await user.clear(search())
    await user.type(search(), 'gpt-4o')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(within(screen.getAllByRole('option')[1]).queryByText('厂商直供')).toBeNull()
  })

  it('moves the highlight with the arrow keys, wraps around, and points aria-activedescendant at it', async () => {
    const user = userEvent.setup()
    storeAllCaches()
    mountApp()

    await user.type(search(), 'gpt')
    expect(search()).not.toHaveAttribute('aria-activedescendant')

    await user.keyboard('{ArrowDown}')
    expect(search()).toHaveAttribute('aria-activedescendant', 'model-catalog-option-0')
    expect(document.getElementById('model-catalog-option-0')).toHaveTextContent('OpenAI')

    await user.keyboard('{ArrowDown}')
    expect(search()).toHaveAttribute('aria-activedescendant', 'model-catalog-option-1')
    expect(document.getElementById('model-catalog-option-1')).toHaveTextContent('OpenRouter')

    await user.keyboard('{ArrowDown}')
    expect(search()).toHaveAttribute('aria-activedescendant', 'model-catalog-option-0')

    await user.keyboard('{ArrowUp}')
    expect(search()).toHaveAttribute('aria-activedescendant', 'model-catalog-option-1')

    await user.type(search(), 'x')
    expect(search()).not.toHaveAttribute('aria-activedescendant')
  })

  it('selects the highlighted option with Enter', async () => {
    const user = userEvent.setup()
    storeAllCaches([exampleOne()])
    mountApp()

    await user.type(search(), 'gpt')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(search()).toHaveValue('OpenAI - GPT-4o')
    expect(fieldInput('方案名称')).toHaveValue('OpenAI · GPT-4o')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByText('已关联 OpenAI · GPT-4o')).toBeInTheDocument()
  })

  it('does nothing on Enter when no option is highlighted', async () => {
    const user = userEvent.setup()
    storeAllCaches([exampleOne()])
    mountApp()

    await user.type(search(), 'gpt')
    await user.keyboard('{Enter}')

    expect(fieldInput('方案名称')).toHaveValue('方案 1')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(search()).toHaveValue('gpt')
    expect(screen.queryByText(/已关联/)).toBeNull()
  })

  it('closes the list and clears the highlight on Escape without selecting', async () => {
    const user = userEvent.setup()
    storeAllCaches([exampleOne()])
    mountApp()

    await user.type(search(), 'gpt')
    await user.keyboard('{ArrowDown}')
    expect(search()).toHaveAttribute('aria-activedescendant', 'model-catalog-option-0')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(search()).toHaveAttribute('aria-expanded', 'false')
    expect(search()).not.toHaveAttribute('aria-activedescendant')
    expect(fieldInput('方案名称')).toHaveValue('方案 1')
  })

  it('shows at most 100 results and says how many models matched', async () => {
    const user = userEvent.setup()
    storeCurrency('CNY')
    stubFetch({ catalog: jsonRoute(catalogPayload()) })
    mountApp()
    await screen.findByText('已载入 111 个可选模型 · 浏览器缓存')

    await user.type(search(), 'bulk')
    expect(screen.getAllByRole('option')).toHaveLength(100)
    expect(screen.getByText('匹配 105 个模型，先显示前 100 个；继续输入可缩小范围。')).toBeInTheDocument()

    await user.clear(search())
    await user.type(search(), 'bulk-model-10')
    expect(screen.getAllByRole('option')).toHaveLength(6)
    expect(screen.queryByText(/先显示前 100 个/)).toBeNull()
  })

  it('does not select a model while no exchange rate is available', async () => {
    const user = userEvent.setup()
    window.localStorage.removeItem(STORAGE_KEYS.currency)
    storeCatalog()
    stubFetch({ rate: networkErrorRoute() })
    mountApp()
    expect(await screen.findByText('USD/CNY 汇率暂不可用')).toBeInTheDocument()

    expect(screen.getByText(/^获取 USD\/CNY 汇率后即可载入目录价格。/)).toBeInTheDocument()
    await user.type(search(), 'gpt-4o')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    for (const option of options) expect(option).toBeDisabled()

    await user.click(options[0])

    expect(fieldInput('方案名称')).toHaveValue('方案 1')
    expect(screen.queryByText(/已关联/)).toBeNull()
    expect(fieldInput('输入 Token')).toHaveValue('100')
  })
})
