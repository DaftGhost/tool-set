import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TextFormatterApp } from './App'
import type { ClipboardPort } from './browser/clipboard'
import { SchemeRepository } from './storage/schemeRepository'

class MemoryStorage implements Storage {
  #items = new Map<string, string>()

  get length(): number {
    return this.#items.size
  }

  clear(): void {
    this.#items.clear()
  }

  getItem(key: string): string | null {
    return this.#items.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.#items.delete(key)
  }

  setItem(key: string, value: string): void {
    this.#items.set(key, value)
  }
}

function renderApp() {
  const storage = new MemoryStorage()
  const repository = new SchemeRepository(storage)
  const clipboard: ClipboardPort = { copy: vi.fn().mockResolvedValue(undefined) }
  const view = render(<TextFormatterApp clipboard={clipboard} repository={repository} />)
  return { ...view, storage, clipboard }
}

describe('TextFormatterApp', () => {
  it('shows every built-in scheme before text is entered', () => {
    renderApp()
    expect(screen.getByRole('heading', { name: 'JSON' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'XML' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'SQL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /JSON 默认/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /XML 默认/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /SQL 默认/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('全部小写（含关键字），缩进 1 个制表符，不压缩')).toBeInTheDocument()
  })

  it('formats JSON with the default tab scheme and hides other types', async () => {
    const user = userEvent.setup()
    const { clipboard } = renderApp()
    await user.click(screen.getByRole('textbox', { name: '待格式化文本' }))
    await user.paste('{"b":1,"a":2}')

    expect(screen.getByText('识别为 JSON')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'XML' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'SQL' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '格式化结果' })).toHaveValue('{\n\t"b": 1,\n\t"a": 2\n}')

    await user.click(screen.getByRole('button', { name: '复制结果' }))
    expect(clipboard.copy).toHaveBeenCalledWith('{\n\t"b": 1,\n\t"a": 2\n}')
  })

  it('keeps the original text when the chosen type cannot format it', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('textbox', { name: '待格式化文本' }))
    await user.paste('{"b":1,"a":2}')
    await user.selectOptions(screen.getByRole('combobox', { name: '文本类型' }), 'sql')

    expect(screen.getByRole('alert')).toHaveTextContent('SQL')
    expect(screen.getByRole('alert')).toHaveTextContent('原文已保留')
    expect(screen.getByRole('textbox', { name: '格式化结果' })).toHaveValue('{"b":1,"a":2}')
    expect(screen.getByRole('heading', { name: 'SQL' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'JSON' })).not.toBeInTheDocument()
  })

  it('shows beautify controls only when compress is off, and only the fields for that type', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '新建方案' }))
    const dialog = screen.getByRole('dialog', { name: '新建方案' })

    expect(within(dialog).getByLabelText('缩进')).toBeInTheDocument()
    expect(within(dialog).getByRole('switch', { name: '按键名排序' })).toHaveAttribute('aria-checked', 'false')
    expect(within(dialog).queryByLabelText('大小写')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('switch', { name: '压缩为一行' }))
    expect(within(dialog).getByRole('switch', { name: '压缩为一行' })).toHaveAttribute('aria-checked', 'true')
    expect(within(dialog).queryByLabelText('缩进')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('switch', { name: '按键名排序' })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('switch', { name: '压缩为一行' }))
    await user.selectOptions(within(dialog).getByLabelText('文本类型'), 'sql')
    expect(within(dialog).getByLabelText('大小写')).toHaveValue('lower')
    expect(within(dialog).queryByRole('switch', { name: '按键名排序' })).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('文本类型'), 'xml')
    expect(within(dialog).getByLabelText('缩进')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('大小写')).not.toBeInTheDocument()
  })

  it('saves, reapplies, and deletes a custom scheme', async () => {
    const user = userEvent.setup()
    const { storage, rerender, clipboard } = renderApp()
    await user.click(screen.getByRole('button', { name: '新建方案' }))
    const dialog = screen.getByRole('dialog', { name: '新建方案' })
    await user.type(within(dialog).getByLabelText('方案名称'), '紧凑 JSON')
    await user.click(within(dialog).getByRole('switch', { name: '压缩为一行' }))
    await user.click(within(dialog).getByRole('button', { name: '保存方案' }))

    expect(screen.getByRole('button', { name: /^紧凑 JSON/ })).toHaveAttribute('aria-pressed', 'true')
    rerender(<TextFormatterApp clipboard={clipboard} repository={new SchemeRepository(storage)} />)
    expect(screen.getByRole('button', { name: /^紧凑 JSON/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('textbox', { name: '待格式化文本' }))
    await user.paste('{"b":1,"a":2}')
    expect(screen.getByRole('textbox', { name: '格式化结果' })).toHaveValue('{"b":1,"a":2}')

    await user.click(screen.getByRole('button', { name: '删除紧凑 JSON' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    expect(screen.queryByRole('button', { name: /^紧凑 JSON/ })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '格式化结果' })).toHaveValue('{\n\t"b": 1,\n\t"a": 2\n}')
  })
})
