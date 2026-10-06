import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivacyProfileGenerator } from './App'
import type { ClipboardPort } from './browser/clipboard'
import type { ProfileSnapshot } from './domain/profile'
import { createRegionFieldRegistry } from './domain/regionFieldRegistry'
import { IndexedDbProfileRepository } from './storage/profileRepository'
import type { ProfileRepository } from './storage/profileRepository'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

const savedProfile: ProfileSnapshot = {
  schemaVersion: 1,
  id: 'saved-profile',
  regionId: 'zh-CN',
  createdAt: '2026-09-27T00:00:00.000Z',
  dataVersion: 'test',
  phoneRisk: 'may-be-assigned',
  notices: [],
  fields: [{
    id: 'name',
    label: '姓名',
    localValue: '测试资料',
    englishValue: 'Test Profile',
    englishStatus: 'converted',
  }],
}

describe('PrivacyProfileGenerator', () => {
  let repository: IndexedDbProfileRepository
  let clipboard: ClipboardPort

  beforeEach(() => {
    repository = new IndexedDbProfileRepository(`app-history-${crypto.randomUUID()}`)
    clipboard = { copy: vi.fn().mockResolvedValue(undefined) }
  })

  it('generates bilingual values and copies the selected value independently', async () => {
    const user = userEvent.setup()
    render(<PrivacyProfileGenerator repository={repository} clipboard={clipboard} />)

    await user.selectOptions(screen.getByRole('combobox', { name: '资料地区' }), 'zh-CN')
    await user.click(screen.getByRole('button', { name: '生成资料' }))

    const nameGroup = await screen.findByRole('group', { name: '姓名' })
    expect(within(nameGroup).getByText('本地形式')).toBeInTheDocument()
    expect(within(nameGroup).getByText('英语形式')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^复制/ })).toHaveLength(9)

    await user.click(within(nameGroup).getByRole('button', { name: '复制姓名的本地形式' }))
    await waitFor(() => expect(clipboard.copy).toHaveBeenCalledTimes(1))
    const localName = vi.mocked(clipboard.copy).mock.calls[0][0]
    expect(localName).toMatch(/[\u3400-\u9fff]/)

    await user.click(within(nameGroup).getByRole('button', { name: '复制姓名的英语形式' }))
    await waitFor(() => expect(clipboard.copy).toHaveBeenCalledTimes(2))
    const englishName = vi.mocked(clipboard.copy).mock.calls[1][0]
    expect(englishName).toMatch(/^[A-Z][a-z]+(?: [A-Z][a-z]+)+$/)
    expect(englishName).not.toBe(localName)
  })

  it.each(['zh-CN', 'en-US', 'en-GB'])('omits language labels on single values in %s and still copies them', async (regionId) => {
    const user = userEvent.setup()
    render(<PrivacyProfileGenerator repository={repository} clipboard={clipboard} />)
    await user.selectOptions(screen.getByRole('combobox', { name: '资料地区' }), regionId)
    await user.click(screen.getByRole('button', { name: '生成资料' }))
    await screen.findByRole('group', { name: '姓名' })

    const labels = regionId === 'zh-CN'
      ? ['邮政编码', '邮箱', '手机号']
      : ['姓名', '出生日期', '地址', '邮政编码', '邮箱', '手机号']
    for (const label of labels) {
      const group = screen.getByRole('group', { name: label })
      expect(within(group).queryByText(/本地形式|英语形式|英语（地区形式）/u)).not.toBeInTheDocument()
      const value = group.querySelector('.field-value')!.textContent
      await user.click(within(group).getByRole('button', { name: `复制${label}` }))
      expect(clipboard.copy).toHaveBeenLastCalledWith(value)
    }
  })

  it('renders a registered regional field only for its region and copies its English value', async () => {
    const user = userEvent.setup()
    const fieldRegistry = createRegionFieldRegistry([{
      id: 'wardCode',
      regionId: 'ja-JP',
      label: '地区代码',
      generate: () => ({
        localValue: 'JP-01',
        englishValue: 'JP District 01',
        englishStatus: 'converted',
        conversionStandard: 'Regional extension fixture',
      }),
    }])
    render(<PrivacyProfileGenerator repository={repository} clipboard={clipboard} fieldRegistry={fieldRegistry} />)

    await user.selectOptions(screen.getByRole('combobox', { name: '资料地区' }), 'ja-JP')
    await user.click(screen.getByRole('button', { name: '生成资料' }))

    const extensionField = await screen.findByRole('group', { name: '地区代码' })
    await user.click(within(extensionField).getByRole('button', { name: '复制地区代码的英语形式' }))
    await waitFor(() => expect(clipboard.copy).toHaveBeenCalledWith('JP District 01'))

    await user.selectOptions(screen.getByRole('combobox', { name: '资料地区' }), 'en-US')
    await user.click(screen.getByRole('button', { name: '生成资料' }))

    expect(screen.queryByRole('group', { name: '地区代码' })).not.toBeInTheDocument()
  })

  it('restores saved history after the page is mounted again', async () => {
    const user = userEvent.setup()
    const firstView = render(<PrivacyProfileGenerator repository={repository} clipboard={clipboard} />)

    await user.click(await screen.findByRole('button', { name: '生成资料' }))
    await screen.findByText('资料已保存在此浏览器中。')
    firstView.unmount()

    render(<PrivacyProfileGenerator repository={repository} clipboard={clipboard} />)

    expect(await screen.findByRole('button', { name: /查看.*资料记录/ })).toBeInTheDocument()
  })

  it('keeps a newly generated profile when the initial history read finishes late', async () => {
    const user = userEvent.setup()
    const initialRead = deferred<ProfileSnapshot[]>()
    const records: ProfileSnapshot[] = []
    let readCount = 0
    const racingRepository: ProfileRepository = {
      listAll: vi.fn(async () => {
        readCount += 1
        return readCount === 1 ? initialRead.promise : records
      }),
      save: vi.fn(async (profile) => { records.unshift(profile) }),
      clearAll: vi.fn(async () => { records.splice(0) }),
    }
    render(<PrivacyProfileGenerator repository={racingRepository} clipboard={clipboard} />)

    await user.click(screen.getByRole('button', { name: '生成资料' }))
    await screen.findByText('资料已保存在此浏览器中。')
    initialRead.resolve([])

    expect(await screen.findByRole('group', { name: '姓名' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /查看中国大陆资料记录/ })).toBeInTheDocument()
  })

  it('keeps the profile available when local history cannot save it', async () => {
    const user = userEvent.setup()
    const failingRepository: ProfileRepository = {
      listAll: () => repository.listAll(),
      save: async () => { throw new Error('storage unavailable') },
      clearAll: () => repository.clearAll(),
    }
    render(<PrivacyProfileGenerator repository={failingRepository} clipboard={clipboard} />)

    await screen.findByText('暂无历史记录')
    await user.click(screen.getByRole('button', { name: '生成资料' }))

    expect(await screen.findByText('本次资料未能保存；当前页面仍可查看和复制。')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '姓名' })).toBeInTheDocument()
  })

  it('preserves the current profile and history when clearing fails', async () => {
    const user = userEvent.setup()
    const failingClearRepository: ProfileRepository = {
      listAll: () => repository.listAll(),
      save: (profile) => repository.save(profile),
      clearAll: async () => { throw new Error('storage unavailable') },
    }
    render(<PrivacyProfileGenerator repository={failingClearRepository} clipboard={clipboard} />)

    await screen.findByText('暂无历史记录')
    await user.click(screen.getByRole('button', { name: '生成资料' }))
    await screen.findByText('资料已保存在此浏览器中。')
    await user.click(screen.getByRole('button', { name: '清除全部' }))
    const dialog = screen.getByRole('alertdialog', { name: '清除全部资料记录？' })
    await user.click(within(dialog).getByRole('button', { name: '确认清除' }))

    expect(await screen.findByText('没有清除历史记录，请检查浏览器存储后重试。')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '姓名' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /查看中国大陆资料记录/ })).toBeInTheDocument()
    await expect(repository.listAll()).resolves.toHaveLength(1)
  })

  it('clears saved history and the visible profile after confirmation', async () => {
    const user = userEvent.setup()
    render(<PrivacyProfileGenerator repository={repository} clipboard={clipboard} />)

    await user.click(await screen.findByRole('button', { name: '生成资料' }))
    await screen.findByText('资料已保存在此浏览器中。')
    await user.click(screen.getByRole('button', { name: '清除全部' }))

    const dialog = screen.getByRole('alertdialog', { name: '清除全部资料记录？' })
    await user.click(within(dialog).getByRole('button', { name: '确认清除' }))

    expect(await screen.findByText('暂无历史记录')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '姓名' })).not.toBeInTheDocument()
    await expect(repository.listAll()).resolves.toEqual([])
  })

  it('prevents clearing while a generated profile is still being saved', async () => {
    const user = userEvent.setup()
    const saveGate = deferred<void>()
    const saveStarted = deferred<void>()
    const records = [savedProfile]
    const racingRepository: ProfileRepository = {
      listAll: vi.fn(async () => [...records]),
      save: vi.fn(async (profile) => {
        saveStarted.resolve()
        await saveGate.promise
        records.unshift(profile)
      }),
      clearAll: vi.fn(async () => { records.splice(0) }),
    }
    render(<PrivacyProfileGenerator repository={racingRepository} clipboard={clipboard} />)

    await screen.findByRole('button', { name: /查看中国大陆资料记录/ })
    await user.click(screen.getByRole('button', { name: '生成资料' }))
    await saveStarted.promise

    expect(screen.getByRole('button', { name: '清除全部' })).toBeDisabled()

    saveGate.resolve()
    await screen.findByText('资料已保存在此浏览器中。')
    await user.click(screen.getByRole('button', { name: '清除全部' }))
    const dialog = screen.getByRole('alertdialog', { name: '清除全部资料记录？' })
    await user.click(within(dialog).getByRole('button', { name: '确认清除' }))

    expect(await screen.findByText('已清除全部历史记录。')).toBeInTheDocument()
    expect(await racingRepository.listAll()).toEqual([])
  })

  it('explains when the browser refuses clipboard access', async () => {
    const user = userEvent.setup()
    clipboard = { copy: vi.fn().mockRejectedValue(new Error('permission denied')) }
    render(<PrivacyProfileGenerator repository={repository} clipboard={clipboard} />)

    await user.click(await screen.findByRole('button', { name: '生成资料' }))
    await user.click(await screen.findByRole('button', { name: '复制姓名的本地形式' }))

    expect(await screen.findByText('复制失败，请手动选择并复制这个值。')).toBeInTheDocument()
  })
})
