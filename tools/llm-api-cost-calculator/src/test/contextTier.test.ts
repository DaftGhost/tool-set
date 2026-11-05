import { screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { draft, storeCurrency, storeScenarios } from './fixtures'
import { mountApp } from './mountApp'
import { jsonRoute, stubFetch } from './network'
import { costLineText, fieldInput, summaryPanel } from './queries'

const tieredCatalog = {
  providers: {
    openai: {
      name: 'OpenAI',
      models: {
        'gpt-6.1-sol': {
          name: 'GPT-6.1 Sol',
          last_updated: '2026-11-01',
          modalities: { input: ['text'], output: ['text'] },
          cost: {
            input: 2,
            output: 10,
            cache_read: 0.1,
            cache_write: 2.5,
            tiers: [
              {
                input: 4,
                output: 15,
                cache_read: 0.2,
                cache_write: 5,
                tier: { type: 'context', size: 272000 },
              },
            ],
          },
        },
      },
    },
    google: {
      name: 'Google',
      models: {
        'gemini-2.5-pro': {
          name: 'Gemini 2.5 Pro',
          last_updated: '2026-11-01',
          modalities: { input: ['text'], output: ['text'] },
          cost: {
            input: 1.25,
            output: 10,
            cache_read: 0.125,
            tiers: [
              {
                input: 2.5,
                output: 15,
                cache_read: 0.25,
                tier: { type: 'context', size: 200000 },
              },
            ],
          },
        },
      },
    },
  },
  models: {
    'openai/gpt-6.1-sol': {},
    'google/gemini-2.5-pro': {},
  },
}

function optionLabels(select: HTMLElement): string[] {
  return [...select.querySelectorAll('option')].map((option) => option.textContent ?? '')
}

async function chooseModel(user: ReturnType<typeof userEvent.setup>, query: string, name: RegExp) {
  const search = screen.getByRole('combobox', { name: '选择模型定价' })
  await user.clear(search)
  await user.type(search, query)
  await user.click(screen.getByRole('option', { name }))
}

beforeEach(() => {
  storeCurrency('CNY')
  storeScenarios([draft('solo', '单次请求', { inputTokensM: '0.272', cacheHitPercent: '0', outputRatioPercent: '0' })])
  stubFetch({ catalog: jsonRoute(tieredCatalog) })
})

describe('context tier and cache TTL pricing', () => {
  it('prices one automatic bracket for the whole request', async () => {
    const user = userEvent.setup()
    mountApp()
    expect(await screen.findByText(/已载入 2 个可选模型/)).toBeInTheDocument()

    await chooseModel(user, 'gpt-6.1-sol', /OpenAI.*GPT-6\.1 Sol/)

    expect(fieldInput('未缓存输入')).toHaveValue('14.4')
    expect(fieldInput('缓存输入')).toHaveValue('0.72')
    expect(fieldInput('缓存写入')).toHaveValue('18')
    expect(fieldInput('输出')).toHaveValue('72')
    expect(screen.queryByLabelText('上下文档位')).toBeNull()
    expect(screen.getByText('不超过 272,000 tokens。整段请求使用这一档单价。')).toBeInTheDocument()
    expect(screen.queryByLabelText('缓存时长')).toBeNull()
    expect(screen.queryByRole('button', { name: '添加时长' })).toBeNull()
    expect(screen.queryByText(/目录默认|catalog default/i)).toBeNull()

    await user.clear(fieldInput('输入 Token'))
    await user.type(fieldInput('输入 Token'), '0.272001')

    expect(fieldInput('未缓存输入')).toHaveValue('28.8')
    expect(fieldInput('缓存输入')).toHaveValue('1.44')
    expect(fieldInput('缓存写入')).toHaveValue('36')
    expect(fieldInput('输出')).toHaveValue('108')
    expect(screen.getByText('超过 272,000 tokens。整段请求使用这一档单价。')).toBeInTheDocument()

    await user.clear(fieldInput('输入 Token'))
    await user.type(fieldInput('输入 Token'), '0.272')
    expect(fieldInput('未缓存输入')).toHaveValue('14.4')
    expect(fieldInput('缓存写入')).toHaveValue('18')
    expect(screen.getByText('不超过 272,000 tokens。整段请求使用这一档单价。')).toBeInTheDocument()

    await user.clear(fieldInput('输入 Token'))
    await user.type(fieldInput('输入 Token'), '0.3')
    await user.clear(fieldInput('缓存命中率'))
    await user.type(fieldInput('缓存命中率'), '50')
    await user.clear(fieldInput('缓存写入占比'))
    await user.type(fieldInput('缓存写入占比'), '20')
    await user.clear(fieldInput('输出占输入比例'))
    await user.type(fieldInput('输出占输入比例'), '10')

    const summary = summaryPanel()
    expect(screen.getByText('未缓存输入占比 30%')).toBeInTheDocument()
    expect(costLineText('缓存命中')).toBe('缓存命中0.15M tokens¥0.216')
    expect(costLineText('缓存写入')).toBe('缓存写入0.06M tokens¥2.16')
    expect(costLineText('未缓存输入')).toBe('未缓存输入0.09M tokens¥2.592')
    expect(costLineText('输出成本')).toBe('输出成本0.03M tokens¥3.24')
    expect(within(summary).getByText('预估总成本').parentElement).toHaveTextContent(/^预估总成本¥8\.208$/)
    expect(screen.getByText('当前 77.6%')).toBeInTheDocument()
  })

  it('starts Gemini with no write share and without an hourly storage TTL', async () => {
    const user = userEvent.setup()
    storeScenarios([draft('solo', '单次请求', { cacheWritePercent: '25', inputTokensM: '0.1' })])
    mountApp()
    expect(await screen.findByText(/已载入 2 个可选模型/)).toBeInTheDocument()

    await chooseModel(user, 'gemini-2.5-pro', /Google.*Gemini 2\.5 Pro/)

    expect(fieldInput('缓存写入占比')).toHaveValue('0')
    expect(fieldInput('缓存写入')).toHaveValue('0')
    expect(screen.queryByLabelText('缓存时长')).toBeNull()
    expect(screen.queryByText(/目录默认/)).toBeNull()
  })

  it('shows only durations from cache_write and hides tiers when the catalog has none', async () => {
    const user = userEvent.setup()
    stubFetch({
      catalog: jsonRoute({
        providers: {
          openai: {
            name: 'OpenAI',
            models: {
              'duration-model': {
                name: 'Duration Model',
                modalities: { input: ['text'], output: ['text'] },
                cost: { input: 2, output: 8, cache_read: 0.2, cache_write: { '1h': 4, '5m': 2.5 } },
              },
              'plain-model': {
                name: 'Plain Model',
                modalities: { input: ['text'], output: ['text'] },
                cost: { input: 1, output: 2 },
              },
            },
          },
        },
        models: { 'openai/duration-model': {}, 'openai/plain-model': {} },
      }),
    })
    mountApp()
    expect(await screen.findByText(/已载入 2 个可选模型/)).toBeInTheDocument()

    await chooseModel(user, 'duration', /Duration Model/)
    expect(screen.queryByLabelText('上下文档位')).toBeNull()
    expect(optionLabels(screen.getByLabelText('缓存时长'))).toEqual(['5m', '1h'])
    expect(fieldInput('缓存写入')).toHaveValue('18')
    await user.selectOptions(screen.getByLabelText('缓存时长'), '1h')
    expect(fieldInput('缓存写入')).toHaveValue('28.8')
    expect(screen.queryByText(/目录默认|catalog default/i)).toBeNull()

    await chooseModel(user, 'plain', /Plain Model/)
    expect(screen.queryByLabelText('上下文档位')).toBeNull()
    expect(screen.queryByLabelText('缓存时长')).toBeNull()
    expect(screen.queryByRole('button', { name: '添加时长' })).toBeNull()
  })
})
