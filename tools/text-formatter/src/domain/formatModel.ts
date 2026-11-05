export type TextKind = 'json' | 'xml' | 'sql'
export type IndentUnit = 'tab' | 'space-2' | 'space-4'
export type SqlCasing = 'lower' | 'upper' | 'keyword-lower' | 'keyword-upper' | 'preserve'

export interface FormatOptions {
  compress: boolean
  indent: IndentUnit
  sortKeys: boolean
  sqlCasing: SqlCasing
}

export interface FormatScheme {
  id: string
  name: string
  kind: TextKind
  builtin: boolean
  options: FormatOptions
}

export interface SchemeSnapshot {
  customSchemes: FormatScheme[]
  lastSchemeIdByKind: Partial<Record<TextKind, string>>
}

export class TextSource {
  static stripBom(input: string): string {
    return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  }
}

export class FormatMessage {
  static readonly unrecognized = '无法识别这段文本。目前只支持 JSON、XML 和 SQL。'
  static readonly json = 'JSON 无法解析。请检查括号、引号和逗号。'
  static readonly xml = 'XML 无法解析。请检查标签是否闭合、属性引号是否成对。'
  static readonly sql = 'SQL 无法识别。请检查是否为 SELECT、INSERT、UPDATE 等语句。'
  static readonly sqlString = 'SQL 字符串没有结束。'
  static readonly sqlComment = 'SQL 注释没有结束。'
  static readonly sqlParen = 'SQL 括号没有闭合。'
  static readonly sqlChar = 'SQL 中有无法识别的字符。'
}

export class FormatOptionsModel {
  static readonly kinds: readonly TextKind[] = ['json', 'xml', 'sql']

  static create(): FormatOptions {
    return { compress: false, indent: 'tab', sortKeys: false, sqlCasing: 'lower' }
  }

  static indentText(indent: IndentUnit): string {
    if (indent === 'tab') return '\t'
    if (indent === 'space-2') return '  '
    return '    '
  }

  static kindLabel(kind: TextKind): string {
    if (kind === 'json') return 'JSON'
    if (kind === 'xml') return 'XML'
    return 'SQL'
  }

  static blurb(kind: TextKind): string {
    if (kind === 'json') return '默认缩进 1 个制表符，不压缩，不排序键。'
    if (kind === 'xml') return '默认缩进 1 个制表符，不压缩。'
    return '默认全部小写（含关键字），缩进 1 个制表符，不压缩。'
  }

  static indentLabel(indent: IndentUnit): string {
    if (indent === 'tab') return '缩进 1 个制表符'
    if (indent === 'space-2') return '缩进 2 个空格'
    return '缩进 4 个空格'
  }

  static casingLabel(casing: SqlCasing): string {
    if (casing === 'lower') return '全部小写（含关键字）'
    if (casing === 'upper') return '全部大写（含关键字）'
    if (casing === 'keyword-lower') return '仅关键字小写'
    if (casing === 'keyword-upper') return '仅关键字大写'
    return '保持原大小写'
  }

  static summary(scheme: FormatScheme): string {
    if (scheme.options.compress) return '压缩为一行'
    const indent = FormatOptionsModel.indentLabel(scheme.options.indent)
    if (scheme.kind === 'json') {
      return `${indent}，不压缩，${scheme.options.sortKeys ? '按键名排序' : '保持键顺序'}`
    }
    if (scheme.kind === 'xml') return `${indent}，不压缩`
    return `${FormatOptionsModel.casingLabel(scheme.options.sqlCasing)}，${indent}，不压缩`
  }
}

export class SchemeCatalog {
  static builtin(): FormatScheme[] {
    const options = FormatOptionsModel.create()
    return [
      { id: 'builtin-json', name: 'JSON 默认', kind: 'json', builtin: true, options: { ...options } },
      { id: 'builtin-xml', name: 'XML 默认', kind: 'xml', builtin: true, options: { ...options } },
      { id: 'builtin-sql', name: 'SQL 默认', kind: 'sql', builtin: true, options: { ...options } },
    ]
  }

  static merge(customSchemes: readonly FormatScheme[]): FormatScheme[] {
    return [...SchemeCatalog.builtin(), ...customSchemes]
  }

  static byKind(schemes: readonly FormatScheme[], kind: TextKind): FormatScheme[] {
    return schemes.filter((scheme) => scheme.kind === kind)
  }

  static selection(snapshot: SchemeSnapshot): Record<TextKind, string> {
    const available = new Set(SchemeCatalog.merge(snapshot.customSchemes).map((scheme) => `${scheme.kind}:${scheme.id}`))
    const selected: Record<TextKind, string> = {
      json: 'builtin-json',
      xml: 'builtin-xml',
      sql: 'builtin-sql',
    }
    for (const kind of FormatOptionsModel.kinds) {
      const saved = snapshot.lastSchemeIdByKind[kind]
      if (saved && available.has(`${kind}:${saved}`)) selected[kind] = saved
    }
    return selected
  }
}

export class SchemeDraft {
  static create(name: string, kind: TextKind, options: FormatOptions): FormatScheme {
    return {
      id: `custom-${crypto.randomUUID()}`,
      name: name.trim(),
      kind,
      builtin: false,
      options: { ...options },
    }
  }
}
