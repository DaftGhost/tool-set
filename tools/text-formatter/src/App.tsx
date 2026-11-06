import { useEffect, useMemo, useState } from 'react'
import { BrowserClipboard, type ClipboardPort } from '../../../shared/browser-clipboard/browserClipboard'
import { HomeOrb } from '../../../shared/home-orb/HomeOrb'
import { FormatterButtons } from './components/formatterButtons'
import { EditorField, ResultDialog } from './components/ResultDialog'
import { SchemeBoard } from './components/SchemeBoard'
import { SchemeDialog } from './components/SchemeDialog'
import {
  FormatOptionsModel,
  SchemeCatalog,
  type FormatScheme,
  type TextKind,
} from './domain/formatModel'
import { TextDetector } from './domain/textDetector'
import { FormatPreview } from './domain/textFormatter'
import { SchemeRepository } from './storage/schemeRepository'

const defaultClipboard = new BrowserClipboard()
const defaultRepository = new SchemeRepository(localStorage)

interface TextFormatterAppProps {
  readonly repository?: SchemeRepository
  readonly clipboard?: ClipboardPort
}

type OverrideKind = TextKind | 'auto'
type DialogState =
  | { mode: 'create' }
  | { mode: 'edit'; scheme: FormatScheme }
  | null

const dangerButton = 'inline-flex min-h-control cursor-pointer items-center justify-center rounded-control border border-clay bg-clay px-3 text-ui font-semibold text-on-deep transition-colors hover:border-danger-deep hover:bg-danger-deep'
const fieldClass = 'min-h-control w-full rounded-control border border-line bg-on-deep px-3 text-ink'

function Mark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" width="25" height="25" fill="none">
      <path d="M8 8h6l2 3h8v13H8V8Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 18h8M12 22h5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function TextFormatterApp({
  repository = defaultRepository,
  clipboard = defaultClipboard,
}: TextFormatterAppProps) {
  const [input, setInput] = useState('')
  const [override, setOverride] = useState<OverrideKind>('auto')
  const [customSchemes, setCustomSchemes] = useState<FormatScheme[]>([])
  const [selected, setSelected] = useState<Record<TextKind, string>>({
    json: 'builtin-json',
    xml: 'builtin-xml',
    sql: 'builtin-sql',
  })
  const [dialog, setDialog] = useState<DialogState>(null)
  const [pendingDelete, setPendingDelete] = useState<FormatScheme | null>(null)
  const [storageError, setStorageError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [resultOpen, setResultOpen] = useState(false)

  useEffect(() => {
    const snapshot = repository.load()
    setCustomSchemes(snapshot.customSchemes)
    setSelected(SchemeCatalog.selection(snapshot))
  }, [repository])

  const detected = useMemo(() => TextDetector.detect(input), [input])
  const kind = override === 'auto' ? detected : override
  const inputEmpty = input.trim() === ''
  const schemes = useMemo(() => SchemeCatalog.merge(customSchemes), [customSchemes])
  const active = kind
    ? schemes.find((scheme) => scheme.id === selected[kind] && scheme.kind === kind)
      ?? schemes.find((scheme) => scheme.builtin && scheme.kind === kind)
      ?? null
    : null
  const preview = useMemo(
    () => FormatPreview.render(input, inputEmpty ? null : kind, active?.options ?? null),
    [input, inputEmpty, kind, active],
  )

  function persist(nextCustom: FormatScheme[], nextSelected: Record<TextKind, string>) {
    try {
      repository.save({ customSchemes: nextCustom, lastSchemeIdByKind: nextSelected })
      setStorageError('')
    } catch {
      setStorageError('方案无法写入此浏览器，当前页面仍可使用。')
    }
  }

  function selectScheme(scheme: FormatScheme) {
    const nextSelected = { ...selected, [scheme.kind]: scheme.id }
    setSelected(nextSelected)
    persist(customSchemes, nextSelected)
  }

  function saveScheme(scheme: FormatScheme) {
    const nextCustom = customSchemes.some((item) => item.id === scheme.id)
      ? customSchemes.map((item) => (item.id === scheme.id ? scheme : item))
      : [...customSchemes, scheme]
    const nextSelected = { ...selected, [scheme.kind]: scheme.id }
    setCustomSchemes(nextCustom)
    setSelected(nextSelected)
    setDialog(null)
    persist(nextCustom, nextSelected)
  }

  function deleteScheme(scheme: FormatScheme) {
    const nextCustom = customSchemes.filter((item) => item.id !== scheme.id)
    const nextSelected = { ...selected }
    if (nextSelected[scheme.kind] === scheme.id) nextSelected[scheme.kind] = `builtin-${scheme.kind}`
    setCustomSchemes(nextCustom)
    setSelected(nextSelected)
    setPendingDelete(null)
    persist(nextCustom, nextSelected)
  }

  async function copyOutput() {
    try {
      await clipboard.copy(preview.output)
      setCopyMessage('已复制格式化结果。')
    } catch {
      setCopyMessage('复制失败，请手动选择结果文本。')
    }
  }

  const typeStatus = inputEmpty
    ? '粘贴文本后会按 JSON、XML、SQL 的顺序识别。'
    : override === 'auto'
      ? detected
        ? `识别为 ${FormatOptionsModel.kindLabel(detected)}`
        : '未识别出支持的类型'
      : `已指定为 ${FormatOptionsModel.kindLabel(override)}`

  return (
    <main className="min-h-screen">
      <HomeOrb />
      <header className="page-inset flex min-h-header flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface/90 py-3 max-phone:min-h-header-phone">
        <div className="home-orb-offset flex items-center gap-4">
          <a aria-label="文本格式化首页" className="inline-flex items-center gap-2.5 text-ink no-underline" href="#top">
            <span className="grid size-gutter place-items-center rounded-control bg-primary-deep text-on-deep"><Mark /></span>
            <span className="text-brand">文本格式化</span>
          </a>
        </div>
        <span className="inline-flex items-center gap-2 text-label text-muted">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary shadow-focus" />
          仅在此浏览器处理
        </span>
      </header>

      <div className="page-frame grid gap-section pt-block pb-footer" id="top">
        <div>
          <h1 className="m-0 text-display text-ink max-phone:text-display-phone">把文本整理成你要的形状</h1>
          <p className="m-0 mt-3 max-w-summary text-ui text-muted">粘贴 JSON、XML 或 SQL。留空时查看全部方案；写入内容后按当前类型套用方案，也可以改成自己的规则。</p>
        </div>

        <div className="editor-columns gap-section">
          <section aria-labelledby="source-heading" className="rounded-panel border border-line bg-surface p-panel shadow-panel">
            <h2 className="m-0 text-section text-ink" id="source-heading">原文</h2>
            <textarea
              aria-label="待格式化文本"
              className={`mt-3 w-full resize-y ${EditorField.classes()}`}
              onChange={(event) => {
                setInput(event.target.value)
                setCopyMessage('')
              }}
              placeholder="在这里粘贴 JSON、XML 或 SQL"
              spellCheck={false}
              value={input}
            />
            <label className="mt-3 grid gap-1.5 text-ui font-bold text-muted" htmlFor="text-kind">
              文本类型
              <select
                className={fieldClass}
                id="text-kind"
                onChange={(event) => setOverride(event.target.value as OverrideKind)}
                value={override}
              >
                <option value="auto">自动识别</option>
                <option value="json">JSON</option>
                <option value="xml">XML</option>
                <option value="sql">SQL</option>
              </select>
            </label>
            <p className="m-0 mt-2 text-ui text-primary-deep">{typeStatus}</p>
          </section>

          <section aria-labelledby="result-heading" className="rounded-panel border border-line bg-surface shadow-panel">
            <div className="flex">
              <div aria-hidden="true" className="w-1 shrink-0 bg-primary" />
              <div className="min-w-0 flex-1 p-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="m-0 text-section text-ink" id="result-heading">结果</h2>
                    <p className="m-0 mt-1 text-label text-muted">{active && !inputEmpty ? `使用方案 ${active.name}` : '等待文本'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      aria-expanded={resultOpen}
                      className={FormatterButtons.quiet()}
                      disabled={!EditorField.canOpen(preview.output)}
                      onClick={() => setResultOpen(true)}
                      type="button"
                    >
                      展开
                    </button>
                    <button className={FormatterButtons.primary()} disabled={inputEmpty} onClick={() => void copyOutput()} type="button">复制结果</button>
                  </div>
                </div>
                {preview.error && <p className="m-0 mt-3 rounded-control border border-warn-line bg-warn-bg px-3 py-2 text-ui text-warn" role="alert">{preview.error}</p>}
                <textarea
                  aria-label="格式化结果"
                  className={`mt-3 w-full resize-y ${EditorField.classes()}`}
                  placeholder="输入内容后，结果会显示在这里"
                  readOnly
                  spellCheck={false}
                  value={preview.output}
                />
                <p aria-live={resultOpen ? 'off' : 'polite'} className="m-0 mt-2 min-h-5 text-ui text-primary-deep" role="status">{copyMessage}</p>
              </div>
            </div>
          </section>
        </div>

        <SchemeBoard
          inputEmpty={inputEmpty}
          kind={kind}
          onCreate={() => setDialog({ mode: 'create' })}
          onDelete={setPendingDelete}
          onEdit={(scheme) => setDialog({ mode: 'edit', scheme })}
          onSelect={selectScheme}
          schemes={schemes}
          selectedIds={selected}
        />

        {storageError && <p className="m-0 text-ui text-clay" role="status">{storageError}</p>}
        <p className="m-0 text-label text-muted">格式化和自定义方案只保存在当前浏览器。清除本网站数据会删除这些方案。</p>
      </div>

      {resultOpen && (
        <ResultDialog
          copyMessage={copyMessage}
          onClose={() => setResultOpen(false)}
          onCopy={() => void copyOutput()}
          output={preview.output}
        />
      )}

      {dialog && (
        <SchemeDialog
          lockKind={dialog.mode === 'create' && kind ? kind : null}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onSubmit={saveScheme}
          scheme={dialog.mode === 'edit' ? dialog.scheme : undefined}
        />
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-10 grid place-items-center bg-ink/38 p-5">
          <section aria-labelledby="delete-dialog-title" aria-modal="true" className="dialog-card rounded-panel border border-line bg-surface p-panel shadow-overlay" role="alertdialog">
            <h2 className="m-0 text-title text-ink" id="delete-dialog-title">删除方案？</h2>
            <p className="m-0 mt-2.5 mb-panel text-value text-muted">「{pendingDelete.name}」会从这台浏览器中移除。</p>
            <div className="flex justify-end gap-2">
              <button className={FormatterButtons.quiet()} onClick={() => setPendingDelete(null)} type="button">取消</button>
              <button className={dangerButton} onClick={() => deleteScheme(pendingDelete)} type="button">确认删除</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
