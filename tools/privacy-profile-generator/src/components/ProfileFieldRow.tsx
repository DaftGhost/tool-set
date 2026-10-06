import type { GeneratedField, RegionId } from '../domain/profile'

interface ProfileFieldRowProps {
  readonly field: GeneratedField
  readonly regionId: RegionId
  readonly onCopy: (field: GeneratedField, language: 'local' | 'english', value: string) => void
}

interface ValueCopyProps {
  readonly field: GeneratedField
  readonly language: 'local' | 'english'
  readonly languageLabel?: string
  readonly value: string
  readonly onCopy: ProfileFieldRowProps['onCopy']
}

function CopyGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none">
      <rect x="5.25" y="1.75" width="8.5" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 13.75v.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ValueCopy({ field, language, languageLabel, value, onCopy }: ValueCopyProps) {
  const actionLabel = field.englishValue
    ? `复制${field.label}的${language === 'local' ? '本地形式' : '英语形式'}`
    : `复制${field.label}`

  return (
    <div className={languageLabel ? 'value-copy' : 'value-copy value-copy--single'}>
      <div className="value-copy__heading">
        {languageLabel && <span>{languageLabel}</span>}
        <button
          aria-label={actionLabel}
          className="copy-button"
          onClick={() => onCopy(field, language, value)}
          type="button"
        >
          <CopyGlyph />
          <span>复制</span>
        </button>
      </div>
      <p className="field-value">{value}</p>
    </div>
  )
}

export function ProfileFieldRow({ field, regionId, onCopy }: ProfileFieldRowProps) {
  const hasEnglishValue = Boolean(field.englishValue)
  const localLabel = regionId === 'en-US' || regionId === 'en-GB' ? '英语（地区形式）' : '本地形式'

  return (
    <div aria-label={field.label} className="profile-field" role="group">
      <h3 className="profile-field__label">{field.label}</h3>
      <div className={hasEnglishValue ? 'profile-field__values profile-field__values--paired' : 'profile-field__values'}>
        <ValueCopy
          field={field}
          language="local"
          languageLabel={hasEnglishValue ? localLabel : undefined}
          onCopy={onCopy}
          value={field.localValue}
        />
        {field.englishValue && (
          <ValueCopy
            field={field}
            language="english"
            languageLabel="英语形式"
            onCopy={onCopy}
            value={field.englishValue}
          />
        )}
        {field.englishStatus === 'no-standard-form' && (
          <p className="conversion-note">该字段没有适用的标准英语表达。</p>
        )}
      </div>
    </div>
  )
}
