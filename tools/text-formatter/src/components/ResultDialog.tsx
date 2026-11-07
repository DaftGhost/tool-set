import { useEffect, useId } from 'react'
import { FormatterButtons } from './formatterButtons'

interface ResultDialogProps {
  output: string
  copyMessage: string
  onClose: () => void
  onCopy: () => void
}

export class EditorField {
  static classes(): string {
    return 'editor-area rounded-inset border border-line bg-surface-alt p-3 font-mono text-value text-ink'
  }

  static canOpen(output: string): boolean {
    return output !== ''
  }
}

export function ResultDialog({ output, copyMessage, onClose, onCopy }: ResultDialogProps) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-10 grid place-items-center bg-ink/38 p-5"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="result-dialog flex max-h-full flex-col overflow-hidden rounded-panel border border-line bg-surface p-panel shadow-overlay"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-title text-ink" id={titleId}>格式化结果</h2>
          <button className={FormatterButtons.quiet()} onClick={onClose} type="button">关闭</button>
        </div>
        <textarea
          aria-label="展开的格式化结果"
          className={`mt-3 min-h-0 w-full flex-1 resize-none overflow-auto ${EditorField.classes()}`}
          readOnly
          spellCheck={false}
          value={output}
        />
        <div className="mt-3 flex items-center justify-end gap-3">
          <p aria-live="polite" className="m-0 mr-auto min-h-5 text-ui text-primary-deep" role="status">{copyMessage}</p>
          <button className={FormatterButtons.primary()} onClick={onCopy} type="button">复制</button>
        </div>
      </section>
    </div>
  )
}
