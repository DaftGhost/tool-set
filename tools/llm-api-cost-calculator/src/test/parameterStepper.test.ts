import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { exampleOne, storeAllCaches } from './fixtures'
import { mountApp } from './mountApp'
import { stubFetch } from './network'
import { fieldInput } from './queries'

beforeEach(() => {
  storeAllCaches([exampleOne()])
  stubFetch({})
})

async function setValue(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.clear(fieldInput(label))
  if (value !== '') await user.type(fieldInput(label), value)
}

describe('R5 parameter field steppers', () => {
  it('steps input tokens by whole millions with the + and − buttons', async () => {
    const user = userEvent.setup()
    mountApp()

    await user.click(screen.getByRole('button', { name: '增加输入 Token' }))
    expect(fieldInput('输入 Token')).toHaveValue('101')

    await user.click(screen.getByRole('button', { name: '减少输入 Token' }))
    await user.click(screen.getByRole('button', { name: '减少输入 Token' }))
    expect(fieldInput('输入 Token')).toHaveValue('99')
  })

  it('caps the cache hit rate at 100', async () => {
    const user = userEvent.setup()
    mountApp()
    await setValue(user, '缓存命中率', '99')

    await user.click(screen.getByRole('button', { name: '增加缓存命中率' }))
    expect(fieldInput('缓存命中率')).toHaveValue('100')

    await user.click(screen.getByRole('button', { name: '增加缓存命中率' }))
    expect(fieldInput('缓存命中率')).toHaveValue('100')
  })

  it('floors the cache hit rate at 0', async () => {
    const user = userEvent.setup()
    mountApp()
    await setValue(user, '缓存命中率', '1')

    await user.click(screen.getByRole('button', { name: '减少缓存命中率' }))
    expect(fieldInput('缓存命中率')).toHaveValue('0')

    await user.click(screen.getByRole('button', { name: '减少缓存命中率' }))
    expect(fieldInput('缓存命中率')).toHaveValue('0')
  })

  it('steps the output ratio by 0.5 and keeps one decimal, even at the 0 floor', async () => {
    const user = userEvent.setup()
    mountApp()
    await setValue(user, '输出占输入比例', '1')

    await user.click(screen.getByRole('button', { name: '减少输出占输入比例' }))
    expect(fieldInput('输出占输入比例')).toHaveValue('0.5')

    await user.click(screen.getByRole('button', { name: '减少输出占输入比例' }))
    // Current behaviour: the floor keeps the step's decimal places, so 0 is shown as 0.0.
    expect(fieldInput('输出占输入比例')).toHaveValue('0.0')

    await user.click(screen.getByRole('button', { name: '增加输出占输入比例' }))
    expect(fieldInput('输出占输入比例')).toHaveValue('0.5')
  })

  it('steps a CNY price by 0.01 with two decimals and floors it at 0', async () => {
    const user = userEvent.setup()
    mountApp()
    await setValue(user, '缓存输入', '0.02')

    await user.click(screen.getByRole('button', { name: '减少缓存输入' }))
    expect(fieldInput('缓存输入')).toHaveValue('0.01')

    await user.click(screen.getByRole('button', { name: '减少缓存输入' }))
    expect(fieldInput('缓存输入')).toHaveValue('0.00')

    await user.click(screen.getByRole('button', { name: '增加缓存输入' }))
    expect(fieldInput('缓存输入')).toHaveValue('0.01')
  })

  it('starts from 0 when the field is empty', async () => {
    const user = userEvent.setup()
    mountApp()
    await setValue(user, '输入 Token', '')

    await user.click(screen.getByRole('button', { name: '增加输入 Token' }))
    expect(fieldInput('输入 Token')).toHaveValue('1')
  })
})
