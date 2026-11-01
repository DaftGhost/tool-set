import { useEffect, useRef, useState } from 'react'
import { BrowserClipboard, type ClipboardPort } from './browser/clipboard'
import { ProfileFieldRow } from './components/ProfileFieldRow'
import { profileRegions, type ProfileSnapshot, type RegionId } from './domain/profile'
import { emptyRegionFieldRegistry, type RegionFieldRegistry } from './domain/regionFieldRegistry'
import { IndexedDbProfileRepository, type ProfileRepository } from './storage/profileRepository'

const defaultRepository = new IndexedDbProfileRepository()
const defaultClipboard = new BrowserClipboard()

interface PrivacyProfileGeneratorProps {
  readonly repository?: ProfileRepository
  readonly clipboard?: ClipboardPort
  readonly fieldRegistry?: RegionFieldRegistry
}

type StorageState = 'loading' | 'ready' | 'error'

function regionLabel(regionId: RegionId): string {
  return profileRegions.find((region) => region.id === regionId)?.label ?? regionId
}

function createdLabel(createdAt: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(createdAt))
}

function PrivacyMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" width="25" height="25" fill="none">
      <path d="M8 13V9a8 8 0 0 1 16 0v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="5" y="12" width="22" height="17" rx="4" fill="currentColor" />
      <circle cx="16" cy="20" r="1.8" fill="#fff" />
    </svg>
  )
}

export function PrivacyProfileGenerator({
  repository = defaultRepository,
  clipboard = defaultClipboard,
  fieldRegistry = emptyRegionFieldRegistry,
}: PrivacyProfileGeneratorProps) {
  const [regionId, setRegionId] = useState<RegionId>('zh-CN')
  const [profiles, setProfiles] = useState<ProfileSnapshot[]>([])
  const [activeProfile, setActiveProfile] = useState<ProfileSnapshot | null>(null)
  const [storageState, setStorageState] = useState<StorageState>('loading')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [showClearDialog, setShowClearDialog] = useState(false)
  const stateRevision = useRef(0)
  const clearRevision = useRef(0)

  useEffect(() => {
    let isMounted = true

    const initialRevision = stateRevision.current

    repository.listAll().then(async (records) => {
      if (!isMounted) return

      if (stateRevision.current === initialRevision) {
        setProfiles(records)
        setActiveProfile(records[0] ?? null)
        setSaveState(records.length ? 'saved' : null)
        setStorageState('ready')
        return
      }

      const refreshRevision = stateRevision.current
      try {
        const latestRecords = await repository.listAll()
        if (!isMounted || stateRevision.current !== refreshRevision) return
        setProfiles(latestRecords)
        setActiveProfile((current) => current ?? latestRecords[0] ?? null)
        setStorageState('ready')
      } catch {
        if (isMounted && stateRevision.current === refreshRevision) setStorageState('error')
      }
    }).catch(() => {
      if (!isMounted) return
      setStorageState('error')
      setStatusMessage('无法读取此浏览器中的历史记录；新生成的资料仍可使用。')
    })

    return () => { isMounted = false }
  }, [repository])

  async function handleGenerate() {
    if (isClearing || showClearDialog) return

    const generationClearRevision = clearRevision.current
    stateRevision.current += 1
    setIsGenerating(true)
    setStatusMessage('')

    try {
      const { generateProfile } = await import('./domain/profileGenerator')
      if (clearRevision.current !== generationClearRevision) return

      const profile = generateProfile(regionId, { fieldRegistry })
      setActiveProfile(profile)
      setSaveState(null)

      try {
        await repository.save(profile)
        if (clearRevision.current !== generationClearRevision) return

        const savedRecords = await repository.listAll().catch(() => null)
        if (clearRevision.current !== generationClearRevision) return

        setProfiles((current) => savedRecords ?? [profile, ...current.filter(({ id }) => id !== profile.id)]
          .sort((first, second) => second.createdAt.localeCompare(first.createdAt)))
        setSaveState('saved')
        setStorageState('ready')
        setStatusMessage('资料已保存在此浏览器中。')
      } catch {
        if (clearRevision.current !== generationClearRevision) return
        setSaveState('unsaved')
        setStatusMessage('本次资料未能保存；当前页面仍可查看和复制。')
      }
    } catch {
      if (clearRevision.current === generationClearRevision) {
        setStatusMessage('暂时无法生成这份资料，请重新尝试。')
      }
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleCopy(field: Parameters<Parameters<typeof ProfileFieldRow>[0]['onCopy']>[0], language: 'local' | 'english', value: string) {
    try {
      await clipboard.copy(value)
      setStatusMessage(`已复制${field.label}${field.englishValue ? `的${language === 'local' ? '本地形式' : '英语形式'}` : ''}。`)
    } catch {
      setStatusMessage('复制失败，请手动选择并复制这个值。')
    }
  }

  async function handleClearHistory() {
    if (isGenerating || isClearing) return

    const clearRequestRevision = ++clearRevision.current
    stateRevision.current += 1
    setIsClearing(true)
    try {
      await repository.clearAll()
      if (clearRevision.current !== clearRequestRevision) return

      setProfiles([])
      setActiveProfile(null)
      setSaveState(null)
      setShowClearDialog(false)
      setStatusMessage('已清除全部历史记录。')
    } catch {
      if (clearRevision.current === clearRequestRevision) {
        setStatusMessage('没有清除历史记录，请检查浏览器存储后重试。')
      }
    } finally {
      setIsClearing(false)
    }
  }

  function showHistoryProfile(profile: ProfileSnapshot) {
    stateRevision.current += 1
    setActiveProfile(profile)
    setSaveState('saved')
    setStatusMessage('')
  }

  return (
    <main className="min-h-screen">
      <header className="profile-topbar flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface/90">
        <div className="flex items-center gap-4">
          <a aria-label="隐私替代资料生成器首页" className="inline-flex items-center gap-2.5 text-ink no-underline max-phone:gap-2" href="#top">
            <span className="brand-mark"><PrivacyMark /></span>
            <span className="brand-name">隐私替代资料</span>
          </a>
          <a className="tool-link hover:text-primary-deep" href="../../">所有工具</a>
        </div>
        <span className="locality-label inline-flex items-center gap-2 max-phone:gap-1.5"><span aria-hidden="true" className="locality-dot" />仅在此浏览器处理</span>
      </header>

      <div className="profile-workspace" id="top">
        <section aria-labelledby="page-title" className="min-w-0">
          <div className="intro-block">
            <h1 className="intro-measure m-0 text-display text-ink max-phone:text-display-phone" id="page-title">不用填写真实资料，也能继续</h1>
            <p className="intro-lede">选择一个资料地区，生成一组协调的合成值，再按需要逐项复制。</p>
          </div>

          <section aria-label="生成设置" className="generator-bar border border-line bg-surface shadow-panel">
            <label className="region-label" htmlFor="profile-region">
              <span>资料地区</span>
              <select
                className="region-select"
                id="profile-region"
                onChange={(event) => setRegionId(event.target.value as RegionId)}
                value={regionId}
              >
                {profileRegions.map((region) => (
                  <option key={region.id} value={region.id}>{region.label}</option>
                ))}
              </select>
            </label>
            <button className="generate-control inline-flex items-center justify-center gap-2 border border-primary bg-primary text-on-deep enabled:hover:border-primary-deep enabled:hover:bg-primary-deep" disabled={isGenerating || isClearing || showClearDialog} onClick={handleGenerate} type="button">
              <span aria-hidden="true" className="generate-symbol">＋</span>
              {isGenerating ? '正在生成…' : '生成资料'}
            </button>
          </section>

          <section aria-labelledby="profile-heading" className="panel-shape sheet-edge overflow-hidden border border-line bg-surface shadow-panel">
            <div className="sheet-header border-b border-line-soft">
              <div>
                <h2 className="section-title" id="profile-heading">资料内容</h2>
                <p className="subhead">{activeProfile ? `${regionLabel(activeProfile.regionId)} · ${createdLabel(activeProfile.createdAt)}` : '生成后会显示在这里'}</p>
              </div>
              {activeProfile && saveState && (
                <span className={saveState === 'saved'
                  ? 'save-chip shrink-0 rounded-badge bg-primary-soft text-primary-deep'
                  : 'save-chip shrink-0 rounded-badge bg-brass-soft text-warn'}>
                  {saveState === 'saved' ? '已保存到本机' : '本次未保存'}
                </span>
              )}
            </div>

            {activeProfile ? (
              <>
                <div aria-label="已生成的资料" className="field-pad">
                  {activeProfile.fields.map((field) => (
                    <ProfileFieldRow field={field} key={field.id} onCopy={handleCopy} regionId={activeProfile.regionId} />
                  ))}
                </div>
                <div className="disclaimer-pad disclaimer-row border-t border-line-soft bg-surface-alt">
                  <span aria-hidden="true" className="disclaimer-mark">i</span>
                  <p className="disclaimer-copy">这是合成示例，不代表真实或经过核验的身份；地址不保证可投递，任何资料也不保证唯一或被第三方接受。</p>
                </div>
                {activeProfile.phoneRisk === 'may-be-assigned' && (
                  <div className="warning-inset warn-edge rounded-control border border-warn-line bg-warn-bg px-3.5 py-3 text-warn" role="note">
                    <strong className="warning-title">手机号提示</strong>
                    <p className="warning-copy">此号码只按地区格式生成，可能属于真实用户。请勿用于联系他人或短信、语音验证。</p>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-stage">
                <span aria-hidden="true" className="empty-mark border border-line bg-surface-alt text-primary">⌁</span>
                <p className="empty-title">还没有生成资料</p>
                <span className="empty-hint">生成一份合成资料，姓名、地址和联系字段会按所选地区一起变化。</span>
              </div>
            )}
          </section>

          <p aria-live="polite" className="status-line" role="status">{statusMessage}</p>
        </section>

        <aside aria-labelledby="history-heading" className="history-pad panel-shape border border-line bg-surface shadow-panel max-stack:order-2">
          <div className="flex items-center justify-between gap-2 border-b border-line-soft pb-4">
            <div>
              <h2 className="section-title" id="history-heading">本机记录</h2>
              <p className="subhead">{profiles.length ? `${profiles.length} 份资料` : '仅此浏览器可查看'}</p>
            </div>
            <button
              className="clear-action rounded-badge text-muted enabled:hover:bg-clay-soft enabled:hover:text-clay"
              disabled={profiles.length === 0 || isClearing || isGenerating}
              onClick={() => setShowClearDialog(true)}
              type="button"
            >
              清除全部
            </button>
          </div>

          {storageState === 'loading' && <p className="history-note text-muted">正在读取本机记录…</p>}
          {storageState === 'error' && <p className="history-note text-clay">无法读取本地历史</p>}
          {storageState === 'ready' && profiles.length === 0 && (
            <p className="history-note text-muted">暂无历史记录</p>
          )}
          {profiles.length > 0 && (
            <ul className="history-list">
              {profiles.map((profile) => {
                const label = regionLabel(profile.regionId)
                const isSelected = activeProfile?.id === profile.id
                return (
                  <li key={profile.id}>
                    <button
                      aria-current={isSelected ? 'true' : undefined}
                      aria-label={`查看${label}资料记录 ${createdLabel(profile.createdAt)}`}
                      className={isSelected
                        ? 'history-entry w-full border border-primary bg-primary-soft text-left text-primary-deep'
                        : 'history-entry w-full border border-transparent bg-transparent text-left text-ink hover:bg-surface-alt'}
                      onClick={() => showHistoryProfile(profile)}
                      type="button"
                    >
                      <span className="history-region">{label}</span>
                      <span className="history-date">{createdLabel(profile.createdAt)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="footnote-offset footnote-pad note-edge flex items-start gap-2 bg-surface-alt">
            <span aria-hidden="true" className="footnote-mark">⌂</span>
            <p className="footnote-copy">记录仅保存在当前浏览器中。清除本网站的浏览器数据会删除记录；其他设备无法查看这些记录。</p>
          </div>
        </aside>
      </div>

      {showClearDialog && (
        <div className="fixed inset-0 z-10 grid place-items-center bg-ink/38 p-5">
          <section aria-labelledby="clear-dialog-title" aria-modal="true" className="dialog-panel rounded-panel border border-line bg-surface p-panel shadow-overlay" role="alertdialog">
            <h2 className="dialog-title" id="clear-dialog-title">清除全部资料记录？</h2>
            <p className="dialog-copy">这会删除此浏览器中保存的所有资料，也会关闭当前显示的资料。</p>
            <div className="dialog-actions">
              <button className="dialog-button rounded-control border border-line bg-primary-soft text-primary-deep enabled:hover:bg-primary-soft-hover" disabled={isClearing || isGenerating} onClick={() => setShowClearDialog(false)} type="button">取消</button>
              <button className="dialog-button rounded-control border border-clay bg-clay text-on-deep enabled:hover:border-danger-deep enabled:hover:bg-danger-deep" disabled={isClearing || isGenerating} onClick={handleClearHistory} type="button">
                {isClearing ? '正在清除…' : '确认清除'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
