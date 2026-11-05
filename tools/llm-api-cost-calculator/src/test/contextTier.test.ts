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
  it('prices one bracket for the whole request and a longer write TTL on top of it', async () => {
    const user = userEvent.setup()
    mountApp()
    expect(await screen.findByText(/已载入 2 个可选模型/)).toBeInTheDocument()

    await chooseModel(user, 'gpt-6.1-sol', /OpenAI.*GPT-6\.1 Sol/)

    expect(fieldInput('未缓存输入')).toHaveValue('14.4')
    expect(fieldInput('缓存输入')).toHaveValue('0.72')
    expect(fieldInput('缓存写入')).toHaveValue('18')
    expect(fieldInput('输出')).toHaveValue('72')
    expect(screen.getByLabelText('上下文档位')).toHaveValue('auto')
    expect(optionLabels(screen.getByLabelText('缓存时长'))).toEqual(['目录默认', '12 小时（2.5× 本档输入价）'])

    await user.clear(fieldInput('输入 Token'))
    await user.type(fieldInput('输入 Token'), '0.272001')

    expect(fieldInput('未缓存输入')).toHaveValue('28.8')
    expect(fieldInput('缓存输入')).toHaveValue('1.44')
    expect(fieldInput('缓存写入')).toHaveValue('36')
    expect(fieldInput('输出')).toHaveValue('108')

    await user.selectOptions(screen.getByLabelText('缓存时长'), 'openai-12h')
    expect(fieldInput('缓存写入')).toHaveValue('72')
    expect(fieldInput('未缓存输入')).toHaveValue('28.8')

    await user.selectOptions(screen.getByLabelText('上下文档位'), 'base')
    expect(fieldInput('输入 Token')).toHaveValue('0.272001')
    expect(fieldInput('未缓存输入')).toHaveValue('14.4')
    expect(fieldInput('缓存写入')).toHaveValue('36')

    await user.selectOptions(screen.getByLabelText('上下文档位'), 'auto')
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
    expect(costLineText('缓存写入')).toBe('缓存写入0.06M tokens¥4.32')
    expect(costLineText('未缓存输入')).toBe('未缓存输入0.09M tokens¥2.592')
    expect(costLineText('输出成本')).toBe('输出成本0.03M tokens¥3.24')
    expect(within(summary).getByText('预估总成本').parentElement).toHaveTextContent(/^预估总成本¥10\.368$/)
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
    expect(optionLabels(screen.getByLabelText('缓存时长'))).toEqual(['目录默认'])
    expect(screen.queryByRole('option', { name: '1 小时（2× 本档输入价）' })).toBeNull()
  })
})
