import { useEffect, useRef, useState } from 'react'
import type { PersonaSnapshot } from './dataContract.ts'
import { formatCharacterSheet, presentPersona } from './persona.ts'
import type { PersonaPresentation, TextSection } from './persona.ts'
import { fetchPersona, PersonaReadError } from './personaClient.ts'
import { clearHistory, historyLimit, loadHistory, rememberPersona, saveHistory } from './personaHistory.ts'
import type { HistoryEntry } from './personaHistory.ts'
import './app.css'

interface Props {
  loadPersona?: () => Promise<PersonaSnapshot>
  copyText?: (text: string) => Promise<void>
}

async function copyCharacterSheet(text: string) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
  await navigator.clipboard.writeText(text)
}

function DrawIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.5" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /><circle cx="16" cy="8" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="8" cy="16" r="1.3" fill="currentColor" /><circle cx="16" cy="16" r="1.3" fill="currentColor" /></svg>
}

function Overview({ persona, snapshot }: { persona: PersonaPresentation; snapshot: PersonaSnapshot }) {
  return <aside className="overview-panel panel" aria-labelledby="overview-heading">
    <div className="panel-heading"><h2 id="overview-heading">人物概况</h2><span className="record-number" title={snapshot.recordId}>#{snapshot.recordId.slice(0, 8)}</span></div>
    <h3 className="persona-name" lang="en">{persona.name ?? 'Name not identified'}</h3>
    <p className="name-note">{persona.name ? '姓名取自源叙述' : '源数据没有独立姓名字段，未识别到一致姓名。'}</p>
    <div className="age-block"><span className="age-value">{snapshot.fields.age}</span><span>岁</span></div>
    {persona.warnings.map(warning => <p className="source-warning" key={warning}>{warning}</p>)}
    <dl className="overview-facts">{persona.overview.map(item => <div key={item.title}><dt>{item.title}</dt><dd lang="en">{item.value}</dd></div>)}</dl>
    <p className="overview-note">概况来自源字段。缺失字段显示 Not provided，不补写人物事实。</p>
  </aside>
}

function SectionList({ sections }: { sections: TextSection[] }) {
  return <div className="detail-sections">{sections.map(section => <section key={section.title}><h3>{section.title}</h3>{section.items ? section.items.length ? <ul className="prose" lang="en">{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="prose" lang="en">Not provided</p> : <p className="prose" lang="en">{section.text}</p>}</section>)}</div>
}

function CharacterContent({ persona }: { persona: PersonaPresentation }) {
  return <div className="character-content">
    <section className="core-panel" aria-labelledby="core-heading"><h2 id="core-heading">核心性格<span>Core persona</span></h2><p className="core-text" lang="en">{persona.core}</p></section>
    <section className="panel professional-panel"><h2>职业生活<span className="heading-caption">Professional life</span></h2><p className="prose" lang="en">{persona.professional}</p></section>
    <section className="interests-panel" aria-labelledby="interests-heading"><h2 id="interests-heading">生活中的他们<span className="heading-caption">兴趣与日常</span></h2><div className="interest-grid">{persona.interests.map(section => <section className="interest-entry" key={section.title}><h3>{section.title}</h3><p className="prose" lang="en">{section.text}</p></section>)}</div></section>
    <section className="panel details-panel"><h2>详细档案</h2><SectionList sections={persona.details} /></section>
  </div>
}

export function RandomPersonaGenerator({ loadPersona = fetchPersona, copyText = copyCharacterSheet }: Props) {
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
  return <main className="persona-page">
    <nav className="top-nav" aria-label="工具导航"><a href="/">工具集</a><span aria-hidden="true">/</span><span>随机人设</span></nav>
    <header className="page-header"><div><h1>随机人设生成器</h1><p>抽取一份完整人设，从性格到生活，读懂一个角色。</p></div><div className="page-actions"><button className="primary-button" onClick={draw} disabled={loading}><DrawIcon />{loading ? '正在抽取' : snapshot ? '再抽取一份' : '随机抽取'}</button><button className="copy-button" onClick={copy} disabled={!snapshot || loading || copying}>{copying ? '正在复制' : '复制人物档案'}</button></div></header>
    <div className="feedback" aria-live="polite"><p role="status">{copyStatus || (loading ? '正在读取人物档案…' : '')}</p>{error && <p className="error-message" role="alert">{error}</p>}</div>
    <details className="history-panel panel"><summary><span>本地历史记录</span><span className="history-count">{history.entries.length}</span></summary><div className="history-body"><div className="history-toolbar"><p>仅保留最近 {historyLimit} 份，保存在当前浏览器，不上传。刷新后恢复最近一份。</p><button onClick={removeHistory} disabled={!history.entries.length || loading}>清空历史记录</button></div>{history.error && <p className="source-warning" role="status">{history.error}</p>}{history.entries.length ? <ol className="history-list">{history.entries.map(entry => {
      const name = presentPersona(entry.snapshot).name ?? '未识别姓名'
      const id = entry.snapshot.recordId.slice(0, 8)
      return <li key={entry.snapshot.recordId}><button aria-label={`查看历史 ${name} #${id}`} aria-current={entry.snapshot.recordId === snapshot?.recordId ? 'true' : undefined} onClick={() => viewHistory(entry)} disabled={loading}><span className="history-name" lang="en">{name}</span><span className="history-meta">#{id}<time dateTime={new Date(entry.drawnAt).toISOString()}>{new Date(entry.drawnAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></span></button></li>
    })}</ol> : <p className="history-empty">还没有本地历史记录。</p>}</div></details>
    {snapshot && persona ? <>
      <div className="persona-layout" aria-busy={loading}><Overview persona={persona} snapshot={snapshot} /><CharacterContent persona={persona} /></div>
      <section className="source-panel" aria-label="数据来源"><div><span className="source-label">数据来源</span><a href={snapshot.source.url} target="_blank" rel="noreferrer">{snapshot.source.dataset}</a></div><div className="source-identifiers"><span>UUID {snapshot.recordId}</span><span title={snapshot.datasetVersion}>版本 {snapshot.datasetVersion.slice(0, 12)}</span><span>分区 {snapshot.source.split}</span><a href={snapshot.source.licenseUrl} target="_blank" rel="noreferrer">{snapshot.source.license}</a><span>加工：按源字段重新排版{persona.name ? '，姓名集中展示、正文称谓调整' : ''}</span></div></section>
      <details className="original-panel panel" open={rawOpen} onToggle={event => setRawOpen(event.currentTarget.open)}><summary><span>档案文本</span><span className="original-hint">英文结构化档案</span></summary><div className="original-body"><label className="sr-only" htmlFor="original-text">英文人物档案文本</label><textarea id="original-text" ref={rawField} value={formatCharacterSheet(snapshot)} readOnly spellCheck={false} className="raw-text" /><p>可以直接选择文本，手动复制人物档案。</p></div></details>
    </> : <section className="empty-panel panel" aria-busy={loading}><div className="empty-file" aria-hidden="true"><DrawIcon /></div><h2>抽取一份人物档案</h2><p>每份人设包含人物概况、性格、职业生活和兴趣。<br />点击“随机抽取”开始阅读。</p><div className="empty-outline"><span>人物概况</span><span>核心性格</span><span>生活兴趣</span><span>详细档案</span></div></section>}
    <footer className="page-footer"><span>人设来自 NVIDIA Nemotron-Personas-USA，英文档案按源字段整理。</span><span>随机抽取可能得到相同记录。</span></footer>
  </main>
}
