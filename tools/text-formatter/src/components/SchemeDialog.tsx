import { useEffect, useId, useState } from 'react'
import {
  FormatOptionsModel,
  SchemeDraft,
  type FormatOptions,
  type FormatScheme,
  type IndentUnit,
  type SqlCasing,
  type TextKind,
} from '../domain/formatModel'

interface SchemeDialogProps {
  mode: 'create' | 'edit'
  scheme?: FormatScheme
  lockKind: TextKind | null
  onClose: () => void
  onSubmit: (scheme: FormatScheme) => void
}

const quietButton = 'inline-flex min-h-control cursor-pointer items-center justify-center rounded-control border border-line bg-primary-soft px-3 text-ui font-semibold text-primary-deep transition-colors hover:bg-primary-soft-hover'
const primaryButton = 'inline-flex min-h-control cursor-pointer items-center justify-center rounded-control border border-primary bg-primary px-4 text-label font-bold text-on-deep transition-colors hover:border-primary-deep hover:bg-primary-deep'
const fieldClass = 'min-h-control w-full rounded-control border border-line bg-on-deep px-3 text-ink'

export function SchemeDialog({ mode, scheme, lockKind, onClose, onSubmit }: SchemeDialogProps) {
  const titleId = useId()
  const initialKind = scheme?.kind ?? lockKind ?? 'json'
  const [name, setName] = useState(scheme?.name ?? '')
  const [kind, setKind] = useState<TextKind>(initialKind)
  const [options, setOptions] = useState<FormatOptions>(scheme?.options ?? FormatOptionsModel.create())
  const [nameError, setNameError] = useState('')
  const kindLocked = mode === 'edit' || lockKind !== null

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('请填写方案名称。')
      return
    }
    if (trimmed.length > 40) {
      setNameError('方案名称最多 40 个字符。')
      return
    }
    if (mode === 'edit' && scheme) {
      onSubmit({ ...scheme, name: trimmed, kind, options: { ...options } })
      return
    }
    onSubmit(SchemeDraft.create(trimmed, kind, options))
  }

  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-ink/38 p-5">
      <form
        aria-labelledby={titleId}
        aria-modal="true"
        className="dialog-card rounded-panel border border-line bg-surface p-panel shadow-overlay"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        role="dialog"
      >
        <h2 className="m-0 text-title text-ink" id={titleId}>{mode === 'edit' ? '编辑方案' : '新建方案'}</h2>
        <p className="m-0 mt-2 text-ui text-muted">压缩开启时只保留压缩开关。关闭后显示缩进，以及这个类型的美化选项。</p>

        <label className="mt-4 grid gap-1.5 text-ui font-bold text-muted" htmlFor="scheme-name">
          方案名称
          <input
            className={fieldClass}
            id="scheme-name"
            maxLength={40}
            onChange={(event) => {
              setName(event.target.value)
              setNameError('')
            }}
            value={name}
          />
        </label>
        {nameError && <p className="m-0 mt-1 text-ui text-danger">{nameError}</p>}

        <label className="mt-3 grid gap-1.5 text-ui font-bold text-muted" htmlFor="scheme-kind">
          文本类型
          <select
            className={fieldClass}
            disabled={kindLocked}
            id="scheme-kind"
            onChange={(event) => setKind(event.target.value as TextKind)}
            value={kind}
          >
            {FormatOptionsModel.kinds.map((item) => (
              <option key={item} value={item}>{FormatOptionsModel.kindLabel(item)}</option>
            ))}
          </select>
        </label>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-inset border border-line-soft bg-surface-alt px-3 py-2">
          <span className="text-ui font-bold text-ink" id="compress-label">压缩为一行</span>
          <button
            aria-checked={options.compress}
            aria-labelledby="compress-label"
            className={options.compress
              ? 'inline-flex min-h-control cursor-pointer items-center rounded-control border border-primary bg-primary px-3 text-ui font-bold text-on-deep'
              : 'inline-flex min-h-control cursor-pointer items-center rounded-control border border-line bg-on-deep px-3 text-ui font-bold text-ink'}
            onClick={() => setOptions((current) => ({ ...current, compress: !current.compress }))}
            role="switch"
            type="button"
          >
            {options.compress ? '开' : '关'}
          </button>
        </div>

        {!options.compress && (
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1.5 text-ui font-bold text-muted" htmlFor="scheme-indent">
              缩进
              <select
                className={fieldClass}
                id="scheme-indent"
                onChange={(event) => setOptions((current) => ({ ...current, indent: event.target.value as IndentUnit }))}
                value={options.indent}
              >
                <option value="tab">1 个制表符</option>
                <option value="space-2">2 个空格</option>
                <option value="space-4">4 个空格</option>
              </select>
            </label>
            {kind === 'json' && (
              <div className="flex items-center justify-between gap-3 rounded-inset border border-line-soft px-3 py-2">
                <span className="text-ui font-bold text-ink" id="sort-label">按键名排序</span>
                <button
                  aria-checked={options.sortKeys}
                  aria-labelledby="sort-label"
                  className={options.sortKeys
                    ? 'inline-flex min-h-control cursor-pointer items-center rounded-control border border-primary bg-primary px-3 text-ui font-bold text-on-deep'
                    : 'inline-flex min-h-control cursor-pointer items-center rounded-control border border-line bg-on-deep px-3 text-ui font-bold text-ink'}
                  onClick={() => setOptions((current) => ({ ...current, sortKeys: !current.sortKeys }))}
                  role="switch"
                  type="button"
                >
                  {options.sortKeys ? '开' : '关'}
                </button>
              </div>
            )}
            {kind === 'sql' && (
              <label className="grid gap-1.5 text-ui font-bold text-muted" htmlFor="scheme-casing">
                大小写
                <select
                  className={fieldClass}
                  id="scheme-casing"
                  onChange={(event) => setOptions((current) => ({ ...current, sqlCasing: event.target.value as SqlCasing }))}
                  value={options.sqlCasing}
                >
                  <option value="lower">全部小写（含关键字）</option>
                  <option value="upper">全部大写（含关键字）</option>
                  <option value="keyword-lower">仅关键字小写</option>
                  <option value="keyword-upper">仅关键字大写</option>
                  <option value="preserve">保持原大小写</option>
                </select>
              </label>
            )}
          </div>
        )}

        <div className="mt-panel flex justify-end gap-2">
          <button className={quietButton} onClick={onClose} type="button">取消</button>
          <button className={primaryButton} type="submit">保存方案</button>
        </div>
      </form>
    </div>
  )
}
