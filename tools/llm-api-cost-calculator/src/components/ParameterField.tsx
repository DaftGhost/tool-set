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
}: ParameterFieldProps) {
  function adjust(direction: -1 | 1) {
    const parsed = Number(value)
    const current = Number.isFinite(parsed) ? parsed : 0
    const next = current + step * direction
    const bounded = Math.max(min, max === undefined ? next : Math.min(max, next))
    const fractionDigits = `${step}`.split('.')[1]?.length ?? 0
    onChange(bounded.toFixed(fractionDigits))
  }

  return (
    <div className={error ? 'parameter-field is-invalid' : 'parameter-field'}>
      <div className="field-heading">
        <label htmlFor={id}>{label}</label>
        <span className="field-unit">{unit}</span>
      </div>
      <div className={readOnly ? 'stepper is-readonly' : 'stepper'}>
        {!readOnly && (
          <button className="step-button" type="button" aria-label={`减少${label}`} onClick={() => adjust(-1)}>−</button>
        )}
        <input
          id={id}
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
          <button className="step-button" type="button" aria-label={`增加${label}`} onClick={() => adjust(1)}>+</button>
        )}
      </div>
      {error && <p id={`${id}-error`} className="field-error" role="status">{error}</p>}
    </div>
  )
}
