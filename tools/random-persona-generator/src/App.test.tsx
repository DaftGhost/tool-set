// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RandomPersonaGenerator } from './App.tsx'
import type { PersonaSnapshot } from './dataContract.ts'
import { snapshot } from '../test/fixtures.ts'
import { formatCharacterSheet } from './persona.ts'
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

describe('persona tool', () => {
  it('shows the extracted name once in the overview and copies the same name-free chapter prose', async () => {
    const user = userEvent.setup()
    const named = { ...snapshot, fields: { ...snapshot.fields, persona: 'Mary Alberti is a careful planner.', professional_persona: 'Mary Alberti manages deliveries.', cultural_background: 'Mary grew up in Wisconsin.' } }
    const copyText = vi.fn(async (_text: string) => {})
    render(<RandomPersonaGenerator loadPersona={async () => named} copyText={copyText} />)
    await user.click(screen.getByRole('button', { name: '随机抽取' }))
    expect(await screen.findByRole('heading', { name: 'Mary Alberti' })).toBeInTheDocument()
    expect(screen.getByText('They are a careful planner.')).toBeInTheDocument()
    expect(screen.getByText('They manage deliveries.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复制人物档案' }))
    expect(copyText).toHaveBeenCalledWith(formatCharacterSheet(named))
    expect(copyText.mock.calls[0]?.[0].match(/Mary Alberti/g)).toHaveLength(1)
  })

  it('persists draws across reloads, restores history without a request, and clears only this tool history', async () => {
    const user = userEvent.setup()
    const first = { ...snapshot, fields: { ...snapshot.fields, persona: 'First saved persona.' } }
    const second = { ...snapshot, recordId: 'c'.repeat(32), fields: { ...snapshot.fields, uuid: 'c'.repeat(32), persona: 'Second saved persona.' } }
    const load = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const copyText = vi.fn(async (_text: string) => {})
    const view = render(<RandomPersonaGenerator loadPersona={load} copyText={copyText} />)
    await user.click(screen.getByRole('button', { name: '随机抽取' }))
    await screen.findByText('First saved persona.')
    await user.click(screen.getByRole('button', { name: '再抽取一份' }))
    await screen.findByText('Second saved persona.')
    view.unmount()
    const noRequest = vi.fn(async () => { throw new Error('must not request') })
    render(<RandomPersonaGenerator loadPersona={noRequest} copyText={copyText} />)
    expect(screen.getByText('Second saved persona.')).toBeInTheDocument()
    await user.click(screen.getByText(/本地历史记录/))
    await user.click(screen.getByRole('button', { name: /查看历史.*eb31fcc3/ }))
    expect(screen.getByText('First saved persona.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复制人物档案' }))
    expect(copyText).toHaveBeenCalledWith(formatCharacterSheet(first))
    expect(noRequest).not.toHaveBeenCalled()
    localStorage.setItem('another-tool', 'keep')
    await user.click(screen.getByRole('button', { name: '清空历史记录' }))
    expect(screen.getByText('还没有本地历史记录。')).toBeInTheDocument()
    expect(screen.getByText('First saved persona.')).toBeInTheDocument()
    expect(localStorage.getItem('another-tool')).toBe('keep')
  })

  it('keeps a drawn persona usable when browser persistence fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    const user = userEvent.setup()
    render(<RandomPersonaGenerator loadPersona={async () => snapshot} />)
    await user.click(screen.getByRole('button', { name: '随机抽取' }))
    expect(await screen.findByText('A curious planner.')).toBeInTheDocument()
    expect(screen.getByText(/历史记录未能保存/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制人物档案' })).toBeEnabled()
  })

  it('starts empty, presents a fetched character, and copies the formatted English sheet only after clipboard confirmation', async () => {
    const user = userEvent.setup()
    const copy = deferred<void>()
    const copyText = vi.fn(() => copy.promise)
    render(<RandomPersonaGenerator loadPersona={async () => snapshot} copyText={copyText} />)
    expect(screen.getByText('抽取一份人物档案')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '随机抽取' }))
    expect(await screen.findByText('A curious planner.')).toBeInTheDocument()
    expect(screen.getByText('Test City')).toBeInTheDocument()
    expect(screen.getByText('Visits exhibitions')).toBeInTheDocument()
    expect(screen.getByText('00123')).toBeInTheDocument()
    expect(screen.getByText('Texan heritage.')).toBeInTheDocument()
    expect(screen.getByText("Driver's scheduling")).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复制人物档案' }))
    expect(copyText).toHaveBeenCalledWith(formatCharacterSheet(snapshot))
    expect(screen.queryByText('人物档案已复制。')).not.toBeInTheDocument()
    copy.resolve()
    expect(await screen.findByText('人物档案已复制。')).toBeInTheDocument()
  })

  it('blocks overlapping requests and preserves the current persona when the next request fails', async () => {
    const user = userEvent.setup()
    const first = deferred<PersonaSnapshot>()
    const load = vi.fn().mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('offline'))
    render(<RandomPersonaGenerator loadPersona={load} />)
    await user.dblClick(screen.getByRole('button', { name: '随机抽取' }))
    expect(load).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '正在抽取' })).toBeDisabled()
    first.resolve(snapshot)
    await screen.findByText('A curious planner.')
    await user.click(screen.getByRole('button', { name: '再抽取一份' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('人设读取失败，请重试。')
    expect(screen.getByText('A curious planner.')).toBeInTheDocument()
  })

  it('offers selectable formatted text after clipboard failure and does not execute embedded HTML', async () => {
    const user = userEvent.setup()
    const text = '### Unknown section\n<img src=x onerror=alert(1)>\n'
    const { container } = render(<RandomPersonaGenerator loadPersona={async () => ({ ...snapshot, fields: { ...snapshot.fields, persona: text } })} copyText={async () => { throw new Error('denied') }} />)
    await user.click(screen.getByRole('button', { name: '随机抽取' }))
    await user.click(await screen.findByRole('button', { name: '复制人物档案' }))
    expect(await screen.findByText('复制失败，可在档案文本面板中手动选择文本。')).toBeInTheDocument()
    expect(screen.getByLabelText('英文人物档案文本')).toHaveValue(formatCharacterSheet({ ...snapshot, fields: { ...snapshot.fields, persona: text } }))
    expect(container.querySelector('img')).toBeNull()
  })

  it('ignores a previous copy confirmation after another persona was drawn', async () => {
    const user = userEvent.setup()
    const copy = deferred<void>()
    const load = vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, recordId: 'c'.repeat(32), fields: { ...snapshot.fields, uuid: 'c'.repeat(32), persona: 'Another persona.' } })
    render(<RandomPersonaGenerator loadPersona={load} copyText={() => copy.promise} />)
    await user.click(screen.getByRole('button', { name: '随机抽取' }))
    await user.click(await screen.findByRole('button', { name: '复制人物档案' }))
    await user.click(screen.getByRole('button', { name: '再抽取一份' }))
    await screen.findByText('Another persona.')
    copy.resolve()
    await waitFor(() => expect(screen.queryByText('人物档案已复制。')).not.toBeInTheDocument())
  })
})
