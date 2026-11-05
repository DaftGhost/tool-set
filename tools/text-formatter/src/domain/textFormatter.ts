import { FormatMessage, type FormatOptions, type TextKind } from './formatModel'
import { JsonFormatter } from './jsonFormatter'
import { SqlFormatter } from './sqlFormatter'
import { XmlFormatter } from './xmlFormatter'

export class TextFormatter {
  static format(kind: TextKind, input: string, options: FormatOptions): string {
    if (kind === 'json') return JsonFormatter.format(input, options)
    if (kind === 'xml') return XmlFormatter.format(input, options)
    return SqlFormatter.format(input, options)
  }
}

export class FormatPreview {
  static render(input: string, kind: TextKind | null, options: FormatOptions | null): { output: string; error: string } {
    if (input.trim() === '') return { output: '', error: '' }
    if (!kind || !options) return { output: input, error: `${FormatMessage.unrecognized}原文已保留。` }
    try {
      return { output: TextFormatter.format(kind, input, options), error: '' }
    } catch (error) {
      const message = error instanceof Error ? error.message : FormatMessage.unrecognized
      return { output: input, error: `${message}原文已保留。` }
    }
  }
}
