type ParameterFieldProps = {
  id: string
  label: string
  unit: string
  value: string
  onChange(value: string): void
  onBlur?(): void
  step?: number
  min?: number
  max?: number
  error?: string
  readOnly?: boolean
  compact?: boolean
}

export function ParameterField({
  id,
  label,
  unit,
  value,
  onChange,
  onBlur,
  step = 1,
  min = 0,
  max,
  error,
  readOnly = false,
  compact = false,
}: ParameterFieldProps) {
  function adjust(direction: -1 | 1) {
    const parsed = Number(value)
    const current = Number.isFinite(parsed) ? parsed : 0
    const next = current + step * direction
    const bounded = Math.max(min, max === undefined ? next : Math.min(max, next))
    const fractionDigits = `${step}`.split('.')[1]?.length ?? 0
    onChange(bounded.toFixed(fractionDigits))
  }

  const inputClass = error
    ? 'w-full min-w-0 rounded-control border border-danger bg-surface px-2 text-center font-mono text-ink read-only:cursor-default read-only:text-muted focus:border-primary focus:bg-surface focus:shadow-focus focus:outline-none'
    : 'w-full min-w-0 rounded-control border border-line-soft bg-surface-alt px-2 text-center font-mono text-ink read-only:cursor-default read-only:text-muted focus:border-primary focus:bg-surface focus:shadow-focus focus:outline-none'
  const compactInputClass = error
    ? 'w-full min-w-0 rounded-control border border-danger bg-surface px-1 text-center font-mono text-ink read-only:cursor-default read-only:text-muted focus:border-primary focus:bg-surface focus:shadow-focus focus:outline-none max-phone:px-2'
    : 'w-full min-w-0 rounded-control border border-line-soft bg-surface-alt px-1 text-center font-mono text-ink read-only:cursor-default read-only:text-muted focus:border-primary focus:bg-surface focus:shadow-focus focus:outline-none max-phone:px-2'

  return (
    <div className="min-w-0">
      <div className={compact
        ? 'mb-2 flex min-h-5 items-baseline justify-between gap-2 max-phone:mb-1.5 max-phone:min-h-0'
        : 'mb-2 flex items-baseline justify-between gap-2 max-phone:mb-1.5'}>
        <label className={compact ? 'text-label font-bold text-ink' : 'text-ui font-bold text-ink'} htmlFor={id}>{label}</label>
        <span className={compact ? 'whitespace-nowrap font-mono text-micro text-primary' : 'whitespace-nowrap font-mono text-meta text-primary'}>{unit}</span>
      </div>
      <div className={compact ? 'stepper-compact' : 'stepper'}>
        {!readOnly && (
          <button className="cursor-pointer rounded-control border border-line bg-surface text-primary transition-colors hover:border-primary-muted hover:bg-surface-alt" type="button" aria-label={`减少${label}`} onClick={() => adjust(-1)}>−</button>
        )}
        <input
          id={id}
          className={compact ? compactInputClass : inputClass}
          value={value}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          maxLength={40}
          readOnly={readOnly}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            if (!readOnly) onChange(event.target.value)
          }}
          onBlur={() => onBlur?.()}
        />
        {!readOnly && (
          <button className="cursor-pointer rounded-control border border-line bg-surface text-primary transition-colors hover:border-primary-muted hover:bg-surface-alt" type="button" aria-label={`增加${label}`} onClick={() => adjust(1)}>+</button>
        )}
      </div>
      {error && <p id={`${id}-error`} className="mt-1 min-h-4 text-meta text-danger" role="status">{error}</p>}
    </div>
  )
}
