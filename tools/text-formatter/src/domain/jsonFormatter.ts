import { FormatMessage, FormatOptionsModel, TextSource, type FormatOptions } from './formatModel'

export class JsonFormatter {
  static isJson(input: string): boolean {
    try {
      JSON.parse(TextSource.stripBom(input).trim())
      return true
    } catch {
      return false
    }
  }

  static format(input: string, options: FormatOptions): string {
    let value: unknown
    try {
      value = JSON.parse(TextSource.stripBom(input).trim())
    } catch {
      throw new Error(FormatMessage.json)
    }
    const normalized = !options.compress && options.sortKeys ? JsonFormatter.#sort(value) : value
    if (options.compress) return JSON.stringify(normalized)
    return JSON.stringify(normalized, null, FormatOptionsModel.indentText(options.indent))
  }

  static #sort(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => JsonFormatter.#sort(item))
    if (!value || typeof value !== 'object') return value
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))) {
      sorted[key] = JsonFormatter.#sort(source[key])
    }
    return sorted
  }
}
