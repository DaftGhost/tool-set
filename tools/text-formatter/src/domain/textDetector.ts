import { JsonFormatter } from './jsonFormatter'
import { SqlFormatter } from './sqlFormatter'
import { TextSource, type TextKind } from './formatModel'
import { XmlFormatter } from './xmlFormatter'

export class TextDetector {
  static detect(input: string): TextKind | null {
    const source = TextSource.stripBom(input)
    if (source.trim() === '') return null
    if (JsonFormatter.isJson(source)) return 'json'
    if (XmlFormatter.isXml(source)) return 'xml'
    if (SqlFormatter.isSql(source)) return 'sql'
    return null
  }
}
