import { FormatOptionsModel, SchemeCatalog, type FormatScheme, type TextKind } from '../domain/formatModel'
import { FormatterButtons } from './formatterButtons'

interface SchemeBoardProps {
  inputEmpty: boolean
  kind: TextKind | null
  schemes: readonly FormatScheme[]
  selectedIds: Record<TextKind, string>
  onSelect: (scheme: FormatScheme) => void
  onCreate: () => void
  onEdit: (scheme: FormatScheme) => void
  onDelete: (scheme: FormatScheme) => void
}

export function SchemeBoard({
  inputEmpty,
  kind,
  schemes,
  selectedIds,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: SchemeBoardProps) {
  const groups = inputEmpty
    ? FormatOptionsModel.kinds.map((item) => ({ kind: item, schemes: SchemeCatalog.byKind(schemes, item) }))
    : kind
      ? [{ kind, schemes: SchemeCatalog.byKind(schemes, kind) }]
      : []

  return (
    <section aria-labelledby="schemes-heading" className="rounded-panel border border-line bg-surface p-panel shadow-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-section text-ink" id="schemes-heading">{inputEmpty ? '全部格式方案' : '当前类型的方案'}</h2>
          <p className="m-0 mt-1.5 text-ui text-muted">
            {inputEmpty ? '没有文本时，三种类型和内置方案都列在这里。' : '有文本时只保留当前类型的方案。'}
          </p>
        </div>
        <button className={FormatterButtons.primary()} onClick={onCreate} type="button">新建方案</button>
      </div>

      {groups.length === 0 && (
        <p className="m-0 mt-section text-ui text-muted">指定 JSON、XML 或 SQL 后，会显示该类型的方案。</p>
      )}

      <div className={inputEmpty ? 'scheme-grid mt-section gap-section' : 'mt-section grid gap-section'}>
        {groups.map((group) => (
          <section aria-labelledby={`kind-${group.kind}`} key={group.kind}>
            <h3 className="m-0 text-heading text-ink" id={`kind-${group.kind}`}>{FormatOptionsModel.kindLabel(group.kind)}</h3>
            <p className="m-0 mt-1 text-label text-muted">{FormatOptionsModel.blurb(group.kind)}</p>
            <ul className="m-0 mt-3 grid list-none gap-2 p-0">
              {group.schemes.map((scheme) => {
                const selected = scheme.id === selectedIds[scheme.kind]
                return (
                  <li className={selected
                    ? 'rounded-inset border border-primary bg-primary-soft p-3'
                    : 'rounded-inset border border-line bg-surface-alt p-3'} key={scheme.id}>
                    <button
                      aria-pressed={selected}
                      className="grid w-full cursor-pointer gap-1 border-0 bg-transparent p-0 text-left"
                      onClick={() => onSelect(scheme)}
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-ui font-bold text-ink">{scheme.name}</span>
                        <span className="rounded-badge bg-on-deep px-1.5 py-1 text-micro text-muted">{scheme.builtin ? '内置' : '自定义'}</span>
                      </span>
                      <span className="text-label text-muted">{FormatOptionsModel.summary(scheme)}</span>
                    </button>
                    {!scheme.builtin && (
                      <div className="mt-2 flex gap-2">
                        <button className={FormatterButtons.quiet()} onClick={() => onEdit(scheme)} type="button">编辑选项</button>
                        <button className="inline-flex min-h-control cursor-pointer items-center rounded-control border border-transparent bg-transparent px-2 text-ui font-semibold text-clay hover:bg-clay-soft" onClick={() => onDelete(scheme)} type="button">
                          删除{scheme.name}
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}
