import { useEffect, useRef, useState } from 'react'
import { BrowserClipboard } from '../../../shared/browser-clipboard/browserClipboard.ts'
import { HomeOrb } from '../../../shared/home-orb/HomeOrb.tsx'
import type { PersonaSnapshot } from './dataContract.ts'
import { formatCharacterSheet, presentPersona } from './persona.ts'
import type { PersonaPresentation, TextSection } from './persona.ts'
import { fetchPersona, PersonaReadError } from './personaClient.ts'
import { clearHistory, historyLimit, loadHistory, rememberPersona, saveHistory } from './personaHistory.ts'
import type { HistoryEntry } from './personaHistory.ts'

const clipboard = new BrowserClipboard()

interface Props {
  loadPersona?: () => Promise<PersonaSnapshot>
  copyText?: (text: string) => Promise<void>
}

function DrawIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.5" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /><circle cx="16" cy="8" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="8" cy="16" r="1.3" fill="currentColor" /><circle cx="16" cy="16" r="1.3" fill="currentColor" /></svg>
}

function Overview({ persona, snapshot }: { persona: PersonaPresentation; snapshot: PersonaSnapshot }) {
  return <aside className="sticky top-panel rounded-panel border border-line bg-surface p-panel shadow-panel max-stack:static max-phone:p-5" aria-labelledby="overview-heading">
    <div className="flex items-center justify-between gap-2"><h2 id="overview-heading" className="text-section">人物概况</h2><span className="font-mono text-ui text-muted" title={snapshot.recordId}>#{snapshot.recordId.slice(0, 8)}</span></div>
    <h3 className="mt-panel mb-1.5 text-name text-primary-deep wrap-anywhere" lang="en">{persona.name ?? 'Name not identified'}</h3>
    <p className="text-ui text-muted">{persona.name ? '姓名取自源叙述' : '源数据没有独立姓名字段，未识别到一致姓名。'}</p>
    <div className="mt-gutter mb-panel flex flex-wrap items-baseline gap-2 text-body text-muted max-stack:my-5"><span className="text-stat text-primary-deep">{snapshot.fields.age}</span><span>岁</span></div>
    {persona.warnings.map(warning => <p className="mb-section text-value text-danger" key={warning}>{warning}</p>)}
    <dl className="fact-grid">{persona.overview.map(item => <div className="border-t border-line py-section max-phone:py-3.5" key={item.title}><dt className="mb-2 text-ui text-muted">{item.title}</dt><dd className="text-body wrap-anywhere" lang="en">{item.value}</dd></div>)}</dl>
    <p className="border-t border-line pt-section text-ui text-muted max-stack:pt-3.5">概况来自源字段。缺失字段显示 Not provided，不补写人物事实。</p>
  </aside>
}

function SectionList({ sections }: { sections: TextSection[] }) {
  return <div className="detail-stack mt-section">{sections.map(section => <section key={section.title}><h3 className="mb-2.5 text-heading text-primary">{section.title}</h3>{section.items ? section.items.length ? <ul className="measure list-disc pl-5 text-body whitespace-pre-wrap wrap-anywhere" lang="en">{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="measure text-body whitespace-pre-wrap wrap-anywhere" lang="en">Not provided</p> : <p className="measure text-body whitespace-pre-wrap wrap-anywhere" lang="en">{section.text}</p>}</section>)}</div>
}

function CharacterContent({ persona }: { persona: PersonaPresentation }) {
  return <div className="grid min-w-0 gap-section">
    <section className="rounded-panel bg-primary-deep px-gutter pt-panel pb-gutter text-surface max-phone:p-panel" aria-labelledby="core-heading"><h2 id="core-heading" className="flex items-baseline justify-between gap-3 text-heading text-line max-phone:flex-wrap">核心性格<span className="text-ui">Core persona</span></h2><p className="mt-section text-lead whitespace-pre-wrap wrap-anywhere" lang="en">{persona.core}</p></section>
    <section className="rounded-panel border border-line bg-surface px-gutter py-panel shadow-panel max-phone:p-5"><h2 className="text-section">职业生活<span className="ml-3 whitespace-nowrap text-ui text-muted">Professional life</span></h2><p className="measure mt-3.5 text-body whitespace-pre-wrap wrap-anywhere" lang="en">{persona.professional}</p></section>
    <section className="pt-2" aria-labelledby="interests-heading"><h2 id="interests-heading" className="mb-4 text-section">生活中的他们<span className="ml-3 whitespace-nowrap text-ui text-muted">兴趣与日常</span></h2><div className="interest-grid gap-3.5">{persona.interests.map(section => <section className="rounded-inset border border-line bg-surface px-panel py-5 max-phone:px-5" key={section.title}><h3 className="mb-2.5 text-heading text-primary">{section.title}</h3><p className="measure text-body whitespace-pre-wrap wrap-anywhere" lang="en">{section.text}</p></section>)}</div></section>
    <section className="rounded-panel border border-line bg-surface px-gutter py-panel shadow-panel max-phone:p-5"><h2 className="text-section">详细档案</h2><SectionList sections={persona.details} /></section>
  </div>
}

export function RandomPersonaGenerator({ loadPersona = fetchPersona, copyText = (text) => clipboard.copy(text) }: Props) {
  const [history, setHistory] = useState(loadHistory)
  const [snapshot, setSnapshot] = useState<PersonaSnapshot | null>(() => history.entries[0]?.snapshot ?? null)
  const [loading, setLoading] = useState(false)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [rawOpen, setRawOpen] = useState(false)
  const inFlight = useRef(false)
  const revision = useRef(0)
  const mounted = useRef(true)
  const rawField = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current += 1 } }, [])
  useEffect(() => { if (rawOpen && copyStatus.startsWith('复制失败')) { rawField.current?.focus(); rawField.current?.select() } }, [rawOpen, copyStatus])

  async function draw() {
    if (inFlight.current) return
    inFlight.current = true
    const current = ++revision.current
    setLoading(true)
    setError('')
    setCopyStatus('')
    try {
      const next = await loadPersona()
      if (!mounted.current || current !== revision.current) return
      setSnapshot(next)
      setRawOpen(false)
      const entries = rememberPersona(history.entries, next)
      setHistory({ entries, error: saveHistory(entries) })
    } catch (failure) {
      if (mounted.current && current === revision.current) setError(failure instanceof PersonaReadError ? failure.message : '人设读取失败，请重试。')
    } finally {
      inFlight.current = false
      if (mounted.current && current === revision.current) setLoading(false)
    }
  }

  function viewHistory(entry: HistoryEntry) {
    if (inFlight.current) return
    revision.current += 1
    setSnapshot(entry.snapshot)
    setError('')
    setCopyStatus('')
    setRawOpen(false)
  }

  function removeHistory() {
    const error = clearHistory()
    setHistory({ entries: error ? history.entries : [], error })
  }

  async function copy() {
    if (!snapshot || copying || loading) return
    const current = revision.current
    setCopying(true)
    setCopyStatus('')
    try {
      await copyText(formatCharacterSheet(snapshot))
      if (mounted.current && current === revision.current) setCopyStatus('人物档案已复制。')
    } catch {
      if (mounted.current && current === revision.current) { setCopyStatus('复制失败，可在档案文本面板中手动选择文本。'); setRawOpen(true) }
    } finally {
      if (mounted.current) setCopying(false)
    }
  }

  const persona = snapshot ? presentPersona(snapshot) : null
  return <main className="mx-auto w-full max-w-page px-gutter pt-gutter pb-panel max-phone:px-gutter-phone max-phone:pt-5 max-phone:pb-5">
    <HomeOrb />
    <header className="mb-2.5 flex items-center justify-between gap-panel max-stack:flex-col max-stack:items-start max-stack:gap-5"><div className="home-orb-offset"><h1 className="text-display text-ink max-phone:text-display-phone">随机人设生成器</h1><p className="mt-3 text-body text-muted">抽取一份完整人设，从性格到生活，读懂一个角色。</p></div><div className="flex shrink-0 gap-2.5 max-phone:w-full max-phone:flex-col"><button className="inline-flex min-h-control items-center justify-center gap-2.5 rounded-control border border-primary bg-primary px-4 py-2.5 text-body font-semibold text-surface transition-colors enabled:hover:border-primary-deep enabled:hover:bg-primary-deep max-phone:w-full" onClick={draw} disabled={loading}><DrawIcon />{loading ? '正在抽取' : snapshot ? '再抽取一份' : '随机抽取'}</button><button className="inline-flex min-h-control items-center justify-center gap-2.5 rounded-control border border-primary bg-surface px-4 py-2.5 text-body font-semibold text-primary-deep transition-colors enabled:hover:bg-primary-soft-hover max-phone:w-full" onClick={copy} disabled={!snapshot || loading || copying}>{copying ? '正在复制' : '复制人物档案'}</button></div></header>
    <div className="min-h-control pt-1.5 pb-3 text-value text-primary" aria-live="polite"><p className="empty:hidden" role="status">{copyStatus || (loading ? '正在读取人物档案…' : '')}</p>{error && <p className="text-danger" role="alert">{error}</p>}</div>
    <details className="mb-5 overflow-hidden rounded-panel border border-line bg-surface shadow-panel"><summary className="flex items-center gap-2.5 px-panel py-4 text-body font-semibold"><span>本地历史记录</span><span className="text-ui text-muted">{history.entries.length}</span></summary><div className="px-panel pb-5"><div className="mb-3.5 flex items-center justify-between gap-3.5 max-phone:flex-col max-phone:items-start"><p className="text-ui text-muted">仅保留最近 {historyLimit} 份，保存在当前浏览器，不上传。刷新后恢复最近一份。</p><button className="shrink-0 rounded-control border border-line bg-transparent px-3 py-2 text-ui text-primary-deep transition-colors" onClick={removeHistory} disabled={!history.entries.length || loading}>清空历史记录</button></div>{history.error && <p className="mb-section text-value text-danger" role="status">{history.error}</p>}{history.entries.length ? <ol className="history-grid m-0 list-none gap-2 p-0">{history.entries.map(entry => {
      const name = presentPersona(entry.snapshot).name ?? '未识别姓名'
      const id = entry.snapshot.recordId.slice(0, 8)
      return <li key={entry.snapshot.recordId}><button className="block w-full rounded-control border border-line bg-surface-alt px-3.5 py-3 text-left text-ink transition-colors aria-current:border-primary aria-current:bg-primary-soft" aria-label={`查看历史 ${name} #${id}`} aria-current={entry.snapshot.recordId === snapshot?.recordId ? 'true' : undefined} onClick={() => viewHistory(entry)} disabled={loading}><span className="block text-body font-semibold wrap-anywhere" lang="en">{name}</span><span className="mt-1.5 flex flex-wrap justify-between gap-1.5 text-label text-muted">#{id}<time dateTime={new Date(entry.drawnAt).toISOString()}>{new Date(entry.drawnAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></span></button></li>
    })}</ol> : <p className="text-ui text-muted">还没有本地历史记录。</p>}</div></details>
    {snapshot && persona ? <>
      <div className="persona-columns gap-section" aria-busy={loading}><Overview persona={persona} snapshot={snapshot} /><CharacterContent persona={persona} /></div>
      <section className="flex flex-wrap items-start justify-between gap-4 pt-panel pb-section text-ui text-muted" aria-label="数据来源"><div className="flex flex-wrap gap-3"><span>数据来源</span><a className="wrap-anywhere transition-colors" href={snapshot.source.url} target="_blank" rel="noreferrer">{snapshot.source.dataset}</a></div><div className="flex flex-wrap gap-3.5 wrap-anywhere"><span>UUID {snapshot.recordId}</span><span title={snapshot.datasetVersion}>版本 {snapshot.datasetVersion.slice(0, 12)}</span><span>分区 {snapshot.source.split}</span><a className="transition-colors" href={snapshot.source.licenseUrl} target="_blank" rel="noreferrer">{snapshot.source.license}</a><span>加工：按源字段重新排版{persona.name ? '，姓名集中展示、正文称谓调整' : ''}</span></div></section>
      <details className="overflow-hidden rounded-panel border border-line bg-surface shadow-panel" open={rawOpen} onToggle={event => setRawOpen(event.currentTarget.open)}><summary className="archive-summary gap-3 px-panel py-5 text-body font-semibold max-phone:px-5 max-phone:py-section"><span>档案文本</span><span className="ml-auto text-ui text-muted max-phone:hidden">英文结构化档案</span></summary><div className="px-panel pb-5 max-phone:px-section"><label className="sr-only" htmlFor="original-text">英文人物档案文本</label><textarea id="original-text" ref={rawField} value={formatCharacterSheet(snapshot)} readOnly spellCheck={false} className="raw-sheet w-full rounded-inset border border-line bg-surface-alt p-4 text-ink" /><p className="mt-2.5 text-ui text-muted">可以直接选择文本，手动复制人物档案。</p></div></details>
    </> : <section className="empty-stage flex flex-col items-center justify-center rounded-panel border border-line bg-surface px-panel py-block text-center shadow-panel max-phone:px-5 max-phone:py-gutter" aria-busy={loading}><div className="empty-mark rounded-inset border border-line bg-canvas text-primary" aria-hidden="true"><DrawIcon /></div><h2 className="text-name">抽取一份人物档案</h2><p className="mt-3.5 text-body text-muted">每份人设包含人物概况、性格、职业生活和兴趣。<br />点击“随机抽取”开始阅读。</p><div className="mt-gutter flex flex-wrap justify-center gap-5 border-t border-line pt-5 text-ui text-muted max-phone:gap-3"><span>人物概况</span><span>核心性格</span><span>生活兴趣</span><span>详细档案</span></div></section>}
    <footer className="mt-panel flex flex-wrap justify-between gap-2.5 text-ui text-muted"><span>人设来自 NVIDIA Nemotron-Personas-USA，英文档案按源字段整理。</span><span>随机抽取可能得到相同记录。</span></footer>
  </main>
}
