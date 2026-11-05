import {
  FormatOptionsModel,
  type FormatOptions,
  type FormatScheme,
  type SchemeSnapshot,
  type SqlCasing,
  type TextKind,
} from '../domain/formatModel'

export class SchemeRepository {
  static readonly storageKey = 'text-formatter.v1'

  constructor(private readonly storage: Storage) {}

  load(): SchemeSnapshot {
    try {
      const raw = this.storage.getItem(SchemeRepository.storageKey)
      if (!raw) return SchemeRepository.#empty()
      return SchemeRepository.#sanitize(JSON.parse(raw) as unknown)
    } catch {
      return SchemeRepository.#empty()
    }
  }

  save(snapshot: SchemeSnapshot): void {
    this.storage.setItem(SchemeRepository.storageKey, JSON.stringify({
      customSchemes: snapshot.customSchemes,
      lastSchemeIdByKind: snapshot.lastSchemeIdByKind,
    }))
  }

  static #empty(): SchemeSnapshot {
    return { customSchemes: [], lastSchemeIdByKind: {} }
  }

  static #sanitize(value: unknown): SchemeSnapshot {
    if (!value || typeof value !== 'object') return SchemeRepository.#empty()
    const record = value as { customSchemes?: unknown; lastSchemeIdByKind?: unknown }
    const customSchemes = Array.isArray(record.customSchemes)
      ? record.customSchemes.flatMap((item) => {
        const scheme = SchemeRepository.#scheme(item)
        return scheme ? [scheme] : []
      })
      : []
    const known = new Set(customSchemes.map((scheme) => scheme.id))
    const lastSchemeIdByKind: SchemeSnapshot['lastSchemeIdByKind'] = {}
    if (record.lastSchemeIdByKind && typeof record.lastSchemeIdByKind === 'object') {
      for (const kind of FormatOptionsModel.kinds) {
        const saved = (record.lastSchemeIdByKind as Record<string, unknown>)[kind]
        if (typeof saved !== 'string') continue
        if (saved === `builtin-${kind}` || known.has(saved)) lastSchemeIdByKind[kind] = saved
      }
    }
    return { customSchemes, lastSchemeIdByKind }
  }

  static #scheme(value: unknown): FormatScheme | null {
    if (!value || typeof value !== 'object') return null
    const scheme = value as Partial<FormatScheme>
    if (scheme.builtin !== false) return null
    if (typeof scheme.id !== 'string' || !scheme.id.startsWith('custom-') || scheme.id.length > 80) return null
    if (typeof scheme.name !== 'string' || scheme.name.trim() === '' || scheme.name.trim().length > 40) return null
    if (!SchemeRepository.#isKind(scheme.kind)) return null
    const options = SchemeRepository.#options(scheme.options)
    if (!options) return null
    return { id: scheme.id, name: scheme.name.trim(), kind: scheme.kind, builtin: false, options }
  }

  static #options(value: unknown): FormatOptions | null {
    if (!value || typeof value !== 'object') return null
    const options = value as Partial<FormatOptions>
    if (typeof options.compress !== 'boolean' || typeof options.sortKeys !== 'boolean') return null
    if (options.indent !== 'tab' && options.indent !== 'space-2' && options.indent !== 'space-4') return null
    if (!SchemeRepository.#isCasing(options.sqlCasing)) return null
    return {
      compress: options.compress,
      indent: options.indent,
      sortKeys: options.sortKeys,
      sqlCasing: options.sqlCasing,
    }
  }

  static #isKind(value: unknown): value is TextKind {
    return value === 'json' || value === 'xml' || value === 'sql'
  }

  static #isCasing(value: unknown): value is SqlCasing {
    return value === 'lower' || value === 'upper' || value === 'keyword-lower' || value === 'keyword-upper' || value === 'preserve'
  }
}
