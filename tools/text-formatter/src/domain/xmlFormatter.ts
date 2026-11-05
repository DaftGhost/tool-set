import { FormatMessage, FormatOptionsModel, TextSource, type FormatOptions } from './formatModel'

type XmlLeaf = 'declaration' | 'pi' | 'doctype' | 'comment' | 'cdata'

interface XmlLeafNode {
  type: XmlLeaf
  raw: string
}

interface XmlTextNode {
  type: 'text'
  value: string
}

interface XmlElementNode {
  type: 'element'
  name: string
  attributes: string
  selfClosing: boolean
  children: XmlNode[]
}

type XmlNode = XmlLeafNode | XmlTextNode | XmlElementNode

export class XmlFormatter {
  static isXml(input: string): boolean {
    try {
      XmlFormatter.#parse(TextSource.stripBom(input))
      return true
    } catch {
      return false
    }
  }

  static format(input: string, options: FormatOptions): string {
    const nodes = XmlFormatter.#parse(TextSource.stripBom(input))
    if (options.compress) return XmlFormatter.#minifyNodes(nodes)
    const indent = FormatOptionsModel.indentText(options.indent)
    return XmlFormatter.#prettyNodes(nodes, 0, indent).join('\n')
  }

  static #parse(source: string): XmlNode[] {
    const roots: XmlNode[] = []
    const stack: XmlElementNode[] = []
    let index = 0

    const append = (node: XmlNode) => {
      const parent = stack.at(-1)
      if (parent) parent.children.push(node)
      else roots.push(node)
    }

    const skipSpaces = () => {
      while (index < source.length && /\s/.test(source[index] ?? '')) index += 1
    }

    const fail = (): never => {
      throw new Error(FormatMessage.xml)
    }

    const readName = () => {
      const start = index
      while (index < source.length && !/[\s/>=]/.test(source[index] ?? '')) index += 1
      if (index === start) fail()
      return source.slice(start, index)
    }

    while (index < source.length) {
      if (source.startsWith('<?', index)) {
        const end = source.indexOf('?>', index + 2)
        if (end < 0) fail()
        const raw = source.slice(index, end + 2)
        const type = /^<\?xml(?:\s|\?>)/i.test(raw) ? 'declaration' : 'pi'
        append({ type, raw })
        index = end + 2
        continue
      }
      if (source.startsWith('<!--', index)) {
        const end = source.indexOf('-->', index + 4)
        if (end < 0) fail()
        append({ type: 'comment', raw: source.slice(index, end + 3) })
        index = end + 3
        continue
      }
      if (source.startsWith('<![CDATA[', index)) {
        const end = source.indexOf(']]>', index + 9)
        if (end < 0) fail()
        append({ type: 'cdata', raw: source.slice(index, end + 3) })
        index = end + 3
        continue
      }
      if (source.startsWith('<!DOCTYPE', index) || source.startsWith('<!doctype', index)) {
        const start = index
        index += 9
        let quote = ''
        let depth = 0
        while (index < source.length) {
          const char = source[index] ?? ''
          if (quote) {
            if (char === quote) quote = ''
            index += 1
            continue
          }
          if (char === '"' || char === "'") quote = char
          else if (char === '[') depth += 1
          else if (char === ']') depth -= 1
          else if (char === '>' && depth === 0) {
            index += 1
            append({ type: 'doctype', raw: source.slice(start, index) })
            break
          }
          index += 1
        }
        if (quote || depth !== 0 || !source.slice(start, index).endsWith('>')) fail()
        continue
      }
      if (source.startsWith('</', index)) {
        index += 2
        const name = readName()
        skipSpaces()
        if (source[index] !== '>') fail()
        index += 1
        const open = stack.pop() ?? fail()
        if (open.name !== name) fail()
        append(open)
        continue
      }
      if (source[index] === '<') {
        index += 1
        const name = readName()
        let attributes = ''
        while (index < source.length) {
          skipSpaces()
          const char = source[index]
          if (char === '>' || char === '/') break
          const attribute = readName()
          skipSpaces()
          if (source[index] !== '=') fail()
          index += 1
          skipSpaces()
          const quote = source[index]
          if (quote !== '"' && quote !== "'") fail()
          index += 1
          const valueStart = index
          while (index < source.length && source[index] !== quote) index += 1
          if (index >= source.length) fail()
          attributes += ` ${attribute}=${quote}${source.slice(valueStart, index)}${quote}`
          index += 1
        }
        let selfClosing = false
        if (source[index] === '/') {
          selfClosing = true
          index += 1
        }
        if (source[index] !== '>') fail()
        index += 1
        const element: XmlElementNode = { type: 'element', name, attributes, selfClosing, children: [] }
        if (selfClosing) append(element)
        else stack.push(element)
        continue
      }

      const start = index
      while (index < source.length && source[index] !== '<') index += 1
      if (index > start) append({ type: 'text', value: source.slice(start, index) })
    }

    if (stack.length > 0) fail()
    const elements = roots.filter((node) => node.type === 'element')
    if (elements.length !== 1) fail()
    if (roots.some((node) => node.type === 'text' && node.value.trim() !== '')) fail()
    return roots
  }

  static #significant(nodes: readonly XmlNode[]): XmlNode[] {
    return nodes.filter((node) => node.type !== 'text' || node.value.trim() !== '')
  }

  static #prettyNodes(nodes: readonly XmlNode[], level: number, indent: string): string[] {
    const pad = indent.repeat(level)
    const lines: string[] = []
    for (const node of XmlFormatter.#significant(nodes)) {
      if (node.type === 'element') lines.push(...XmlFormatter.#prettyElement(node, level, indent))
      else if (node.type === 'text') lines.push(`${pad}${node.value.trim()}`)
      else lines.push(`${pad}${node.raw}`)
    }
    return lines
  }

  static #prettyElement(element: XmlElementNode, level: number, indent: string): string[] {
    const pad = indent.repeat(level)
    const open = `<${element.name}${element.attributes}${element.selfClosing ? '/>' : '>'}`
    if (element.selfClosing) return [`${pad}${open}`]
    const children = XmlFormatter.#significant(element.children)
    if (children.length === 0) return [`${pad}<${element.name}${element.attributes}></${element.name}>`]
    if (children.length === 1 && children[0]?.type === 'text') {
      return [`${pad}<${element.name}${element.attributes}>${children[0].value}</${element.name}>`]
    }
    return [
      `${pad}${open}`,
      ...XmlFormatter.#prettyNodes(children, level + 1, indent),
      `${pad}</${element.name}>`,
    ]
  }

  static #minifyNodes(nodes: readonly XmlNode[]): string {
    return XmlFormatter.#significant(nodes).map((node) => {
      if (node.type === 'text') return node.value.replace(/\s+/g, ' ').trim()
      if (node.type !== 'element') return node.raw
      if (node.selfClosing) return `<${node.name}${node.attributes}/>`
      return `<${node.name}${node.attributes}>${XmlFormatter.#minifyNodes(node.children)}</${node.name}>`
    }).join('')
  }
}
