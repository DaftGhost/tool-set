import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { draft, exampleOne, exampleTwo, storeCatalog, storeCurrency, storeScenarios } from './fixtures'
import { mountApp } from './mountApp'
import { stubFetch } from './network'
import { fieldInput, scenarioCard, scenarioMainButton } from './queries'

beforeEach(() => {
  storeCurrency('CNY')
  storeCatalog()
  stubFetch({})
})

const addButton = () => screen.getByRole('button', { name: '添加方案' })

describe('R2 scenario management', () => {
  it('copies the active scenario as a new 方案 N and makes the copy active', async () => {
    const user = userEvent.setup()
    mountApp()

    await user.click(scenarioMainButton('方案 2'))
    await user.click(addButton())

    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(scenarioMainButton('方案 3')).toHaveAttribute('aria-pressed', 'true')
    expect(scenarioMainButton('方案 2')).toHaveAttribute('aria-pressed', 'false')
    expect(fieldInput('方案名称')).toHaveValue('方案 3')
    // The copy takes the prices of the scenario that was active when 添加方案 was pressed.
    expect(fieldInput('缓存输入')).toHaveValue('0.02')
    expect(fieldInput('未缓存输入')).toHaveValue('2')
    expect(fieldInput('输出')).toHaveValue('4')
    expect(scenarioCard('方案 3')).toHaveTextContent('¥7.88')
    expect(scenarioCard('方案 2')).toHaveTextContent('¥7.88')
  })

  it('names the copy with the smallest unused 方案 N', async () => {
    const user = userEvent.setup()
    storeScenarios([exampleOne(), exampleTwo()])
    mountApp()

    await user.clear(fieldInput('方案名称'))
    await user.type(fieldInput('方案名称'), 'Alpha')
    await user.click(addButton())

    expect(scenarioCard('Alpha')).toBeInTheDocument()
    expect(scenarioCard('方案 1')).toBeInTheDocument()
    expect(fieldInput('方案名称')).toHaveValue('方案 1')
  })

  it('stops adding scenarios at 16 and shows the limit note', async () => {
    const user = userEvent.setup()
    mountApp()

    for (let count = 3; count <= 16; count += 1) {
      await user.click(addButton())
    }

    expect(screen.getAllByRole('article')).toHaveLength(16)
    expect(scenarioMainButton('方案 16')).toHaveAttribute('aria-pressed', 'true')
    expect(addButton()).toBeDisabled()
    expect(screen.getByText('最多比较 16 个方案。')).toBeInTheDocument()
  })

  it('does not offer removal when only one scenario is left', async () => {
    const user = userEvent.setup()
    mountApp()

    expect(screen.getByRole('button', { name: '删除方案 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除方案 2' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '删除方案 2' }))

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^删除/ })).toBeNull()
    expect(screen.queryByText('最多比较 16 个方案。')).toBeNull()
  })

  it('selects the previous scenario when the active one is removed', async () => {
    const user = userEvent.setup()
    storeScenarios([exampleOne(), exampleTwo(), draft('example-3', '方案 3')], 'example-3')
    mountApp()

    expect(fieldInput('方案名称')).toHaveValue('方案 3')
    await user.click(screen.getByRole('button', { name: '删除方案 3' }))

    expect(screen.queryByText('方案 3')).toBeNull()
    expect(scenarioMainButton('方案 2')).toHaveAttribute('aria-pressed', 'true')
    expect(fieldInput('方案名称')).toHaveValue('方案 2')
  })

  it('selects the next scenario when the first one is removed while active', async () => {
    const user = userEvent.setup()
    storeScenarios([exampleOne(), exampleTwo(), draft('example-3', '方案 3')], 'example-1')
    mountApp()

    await user.click(screen.getByRole('button', { name: '删除方案 1' }))

    expect(screen.queryByText('方案 1')).toBeNull()
    expect(scenarioMainButton('方案 2')).toHaveAttribute('aria-pressed', 'true')
    expect(fieldInput('方案名称')).toHaveValue('方案 2')
  })

  it('keeps the active scenario when a different scenario is removed', async () => {
    const user = userEvent.setup()
    storeScenarios([exampleOne(), exampleTwo(), draft('example-3', '方案 3')], 'example-2')
    mountApp()

    await user.click(screen.getByRole('button', { name: '删除方案 3' }))

    expect(screen.queryByText('方案 3')).toBeNull()
    expect(scenarioMainButton('方案 2')).toHaveAttribute('aria-pressed', 'true')
    expect(fieldInput('方案名称')).toHaveValue('方案 2')
  })

  it('truncates a typed name to 32 characters', async () => {
    mountApp()
    const name = fieldInput('方案名称')
    expect(name).toHaveAttribute('maxlength', '32')

    // fireEvent bypasses the maxlength attribute, so the component-side slice is what shortens the value.
    fireEvent.input(name, { target: { value: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJ' } })

    await waitFor(() => expect(fieldInput('方案名称')).toHaveValue('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEF'))
    expect(scenarioCard('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEF')).toBeInTheDocument()
  })

  it('shows the cheapest marker only when at least two scenarios can be priced', async () => {
    const user = userEvent.setup()
    mountApp()

    expect(screen.getAllByText('最低')).toHaveLength(1)
    expect(within(scenarioCard('方案 2')).getByText('最低')).toBeInTheDocument()

    await user.clear(fieldInput('缓存输入'))
    await user.type(fieldInput('缓存输入'), '-1')
    expect(screen.queryByText('最低')).toBeNull()
    expect(scenarioCard('方案 1')).toHaveTextContent('参数待修正')
  })

  it('gives the marker to the earlier scenario when two scenarios tie', async () => {
    const user = userEvent.setup()
    mountApp()

    await user.click(scenarioMainButton('方案 2'))
    await user.click(addButton())

    expect(screen.getAllByText('最低')).toHaveLength(1)
    expect(within(scenarioCard('方案 2')).getByText('最低')).toBeInTheDocument()
    expect(within(scenarioCard('方案 3')).queryByText('最低')).toBeNull()
  })
})
