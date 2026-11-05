import { FormatMessage, FormatOptionsModel, TextSource, type FormatOptions, type SqlCasing } from './formatModel'
import { SqlLexicon } from './sqlLexicon'

interface SqlToken {
  kind: 'word' | 'string' | 'number' | 'comment' | 'punct' | 'operator'
  value: string
  upper: string
  keyword: boolean
}

interface SqlFrame {
  kind: 'root' | 'subquery' | 'list' | 'group'
  clauseIndent: number
  bodyList: boolean
  itemIndent: number
  closeIndent: number
}

export class SqlFormatter {
  static isSql(input: string): boolean {
    try {
      return SqlFormatter.#startsWithStatement(SqlFormatter.#prepare(input))
    } catch {
      return false
    }
  }

  static format(input: string, options: FormatOptions): string {
    const tokens = SqlFormatter.#applyCase(
      SqlFormatter.#prepare(input),
      options.compress ? 'preserve' : options.sqlCasing,
    )
    if (!SqlFormatter.#startsWithStatement(tokens)) throw new Error(FormatMessage.sql)
    if (options.compress) return SqlFormatter.#minify(tokens)
    return SqlFormatter.#pretty(tokens, FormatOptionsModel.indentText(options.indent))
  }

  static #prepare(input: string): SqlToken[] {
    return SqlFormatter.#mergePhrases(SqlFormatter.#tokenize(TextSource.stripBom(input)))
  }

  static #tokenize(source: string): SqlToken[] {
    const tokens: SqlToken[] = []
    const operators = [...SqlLexicon.operators].sort((left, right) => right.length - left.length)
    let index = 0

    while (index < source.length) {
      const char = source[index] ?? ''
      if (/\s/.test(char)) {
        index += 1
        continue
      }
      if (char === '-' && source[index + 1] === '-') {
        const end = source.indexOf('\n', index)
        let value = source.slice(index, end === -1 ? source.length : end)
        if (value.endsWith('\r')) value = value.slice(0, -1)
        tokens.push(SqlFormatter.#token('comment', value, false))
        index = end === -1 ? source.length : end + 1
        continue
      }
      if (char === '#') {
        const end = source.indexOf('\n', index)
        let value = source.slice(index, end === -1 ? source.length : end)
        if (value.endsWith('\r')) value = value.slice(0, -1)
        tokens.push(SqlFormatter.#token('comment', value, false))
        index = end === -1 ? source.length : end + 1
        continue
      }
      if (char === '/' && source[index + 1] === '*') {
        const end = source.indexOf('*/', index + 2)
        if (end < 0) throw new Error(FormatMessage.sqlComment)
        tokens.push(SqlFormatter.#token('comment', source.slice(index, end + 2), false))
        index = end + 2
        continue
      }
      if (char === "'" || char === '"' || char === '`') {
        const value = SqlFormatter.#readQuoted(source, index, char)
        tokens.push(SqlFormatter.#token('string', value, false))
        index += value.length
        continue
      }
      if (char === '[') {
        const value = SqlFormatter.#readBracket(source, index)
        tokens.push(SqlFormatter.#token('string', value, false))
        index += value.length
        continue
      }
      if (char === '$') {
        const quoted = SqlFormatter.#readDollar(source, index)
        if (quoted) {
          tokens.push(SqlFormatter.#token('string', quoted, false))
          index += quoted.length
          continue
        }
        if (/[0-9]/.test(source[index + 1] ?? '')) {
          let end = index + 1
          while (/[0-9]/.test(source[end] ?? '')) end += 1
          tokens.push(SqlFormatter.#token('word', source.slice(index, end), false))
          index = end
          continue
        }
      }
      if (/[0-9]/.test(char) || ((char === '-' || char === '+') && /[0-9]/.test(source[index + 1] ?? '') && SqlFormatter.#canPrefixNumber(tokens.at(-1)))) {
        const value = SqlFormatter.#readNumber(source, index)
        tokens.push(SqlFormatter.#token('number', value, false))
        index += value.length
        continue
      }
      if (SqlFormatter.#isWordStart(char)) {
        let end = index + 1
        while (SqlFormatter.#isWordPart(source[end] ?? '')) end += 1
        const word = source.slice(index, end)
        if (/^[nNxXeEuUbB]$/.test(word) && source[end] === "'") {
          const literal = SqlFormatter.#readQuoted(source, end, "'")
          tokens.push(SqlFormatter.#token('string', word + literal, false))
          index = end + literal.length
          continue
        }
        const upper = word.toUpperCase()
        tokens.push(SqlFormatter.#token('word', word, SqlLexicon.keywords.has(upper)))
        index = end
        continue
      }
      const operator = operators.find((item) => source.startsWith(item, index))
      if (operator) {
        const kind = '.,;()'.includes(operator) || operator === '*' ? 'punct' : 'operator'
        tokens.push(SqlFormatter.#token(kind, operator, false))
        index += operator.length
        continue
      }
      if (char === '.' || char === ',' || char === ';' || char === '(' || char === ')') {
        tokens.push(SqlFormatter.#token('punct', char, false))
        index += 1
        continue
      }
      throw new Error(FormatMessage.sqlChar)
    }
    return tokens
  }

  static #token(kind: SqlToken['kind'], value: string, keyword: boolean): SqlToken {
    return { kind, value, upper: kind === 'word' ? value.toUpperCase() : value, keyword }
  }

  static #isWordStart(char: string): boolean {
    return /^[\p{L}_]$/u.test(char)
  }

  static #isWordPart(char: string): boolean {
    return /^[\p{L}\p{N}_$]$/u.test(char)
  }

  static #canPrefixNumber(previous: SqlToken | undefined): boolean {
    if (!previous) return true
    if (previous.kind === 'operator') return true
    return previous.value === '(' || previous.value === ',' || previous.value === ';'
  }

  static #readQuoted(source: string, index: number, quote: string): string {
    let end = index + 1
    while (end < source.length) {
      if (source[end] === quote) {
        if (source[end + 1] === quote) {
          end += 2
          continue
        }
        return source.slice(index, end + 1)
      }
      end += 1
    }
    throw new Error(FormatMessage.sqlString)
  }

  static #readBracket(source: string, index: number): string {
    let end = index + 1
    while (end < source.length) {
      if (source[end] === ']' && source[end + 1] === ']') {
        end += 2
        continue
      }
      if (source[end] === ']') return source.slice(index, end + 1)
      end += 1
    }
    throw new Error(FormatMessage.sqlString)
  }

  static #readDollar(source: string, index: number): string | null {
    const open = /^\$[A-Za-z0-9_]*\$/.exec(source.slice(index))
    if (!open) return null
    const end = source.indexOf(open[0], index + open[0].length)
    if (end < 0) throw new Error(FormatMessage.sqlString)
    return source.slice(index, end + open[0].length)
  }

  static #readNumber(source: string, index: number): string {
    let end = index
    if (source[end] === '-' || source[end] === '+') end += 1
    if (source.slice(end, end + 2).toLowerCase() === '0x') {
      end += 2
      while (/[0-9a-fA-F]/.test(source[end] ?? '')) end += 1
      return source.slice(index, end)
    }
    while (/[0-9]/.test(source[end] ?? '')) end += 1
    if (source[end] === '.' && /[0-9]/.test(source[end + 1] ?? '')) {
      end += 1
      while (/[0-9]/.test(source[end] ?? '')) end += 1
    }
    if ((source[end] === 'e' || source[end] === 'E') && /[0-9+-]/.test(source[end + 1] ?? '')) {
      end += 1
      if (source[end] === '+' || source[end] === '-') end += 1
      while (/[0-9]/.test(source[end] ?? '')) end += 1
    }
    return source.slice(index, end)
  }

  static #mergePhrases(tokens: readonly SqlToken[]): SqlToken[] {
    const merged: SqlToken[] = []
    for (let index = 0; index < tokens.length; index += 1) {
      const phrase = SqlLexicon.phrases.find((words) => words.every((word, offset) => tokens[index + offset]?.kind === 'word' && tokens[index + offset]?.upper === word))
      const current = tokens[index]
      if (!phrase || !current) {
        if (current) merged.push(current)
        continue
      }
      const parts = tokens.slice(index, index + phrase.length)
      merged.push({
        kind: 'word',
        keyword: true,
        upper: phrase.join(' '),
        value: parts.map((part) => part.value).join(' '),
      })
      index += phrase.length - 1
    }
    return merged
  }

  static #applyCase(tokens: readonly SqlToken[], casing: SqlCasing): SqlToken[] {
    return tokens.map((token) => {
      if (casing === 'preserve') return token
      if (casing === 'lower') return { ...token, value: token.value.toLowerCase() }
      if (casing === 'upper') return { ...token, value: token.value.toUpperCase() }
      if (!token.keyword) return token
      return { ...token, value: casing === 'keyword-lower' ? token.value.toLowerCase() : token.value.toUpperCase() }
    })
  }

  static #startsWithStatement(tokens: readonly SqlToken[]): boolean {
    let index = 0
    while (tokens[index]?.kind === 'comment') index += 1
    while (tokens[index]?.value === '(') {
      index += 1
      while (tokens[index]?.kind === 'comment') index += 1
    }
    const head = tokens[index]?.upper.split(' ')[0] ?? ''
    return SqlLexicon.statementStarts.has(head)
  }

  static #minify(tokens: readonly SqlToken[]): string {
    let output = ''
    let previous: SqlToken | undefined
    for (const token of tokens) {
      const rendered = token.kind === 'comment' ? SqlFormatter.#oneLineComment(token.value) : token.value
      if (previous && SqlFormatter.#minifySpace(previous, token)) output += ' '
      output += rendered
      previous = token
    }
    return output.trim()
  }

  static #oneLineComment(value: string): string {
    if (value.startsWith('--') || value.startsWith('#')) {
      const body = value.slice(value.startsWith('--') ? 2 : 1).trim().replace(/\*\//g, '* /')
      return `/* ${body} */`
    }
    return value.replace(/\s+/g, ' ')
  }

  static #minifySpace(previous: SqlToken, next: SqlToken): boolean {
    const tight = new Set(['.', '::', '->', '->>'])
    if (tight.has(previous.value) || tight.has(next.value)) return false
    if (previous.value === '(' || next.value === ')' || next.value === ',' || next.value === ';') return false
    if (next.value === '(') return SqlFormatter.#spaceBeforeParen(previous)
    if (next.value === '*') return previous.value !== '(' && previous.value !== '.'
    if (previous.value === '*') return next.value !== ')' && next.value !== ',' && next.value !== '.'
    return true
  }

  static #spaceBeforeParen(previous: SqlToken | undefined): boolean {
    if (!previous || previous.kind !== 'word') return Boolean(previous)
    return !SqlLexicon.functions.has(previous.upper)
  }

  static #pretty(tokens: readonly SqlToken[], indentUnit: string): string {
    const lines: string[] = []
    const stack: SqlFrame[] = []
    let frame: SqlFrame = { kind: 'root', clauseIndent: 0, bodyList: false, itemIndent: 1, closeIndent: 0 }
    let current = ''
    let lineHasText = false
    let lineIndent = 0
    let expectBody = false
    let inlineRest = false
    let nextLineIndent: number | null = null
    let tightNext = false
    let betweenOpen = false
    let previous: SqlToken | undefined

    const pad = (level: number) => indentUnit.repeat(Math.max(0, level))
    const breakLine = () => {
      if (!lineHasText) return
      lines.push(current.trimEnd())
      current = ''
      lineHasText = false
    }
    const startLine = (level: number) => {
      breakLine()
      lineIndent = level
      current = pad(level)
    }
    const writeToken = (value: string, spaced: boolean) => {
      if (!lineHasText) {
        current += value
        lineHasText = true
        return
      }
      if (spaced && current.at(-1) !== ' ' && current.at(-1) !== '(') current += ' '
      current += value
    }
    const isStructural = (token: SqlToken) => (frame.kind === 'root' || frame.kind === 'subquery') && token.keyword

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]
      if (!token) continue
      const clause = isStructural(token) && SqlLexicon.clauses.has(token.upper)
      if (token.kind === 'comment') {
        expectBody = false
        inlineRest = false
        nextLineIndent = null
        startLine(frame.clauseIndent)
        writeToken(token.value, false)
        breakLine()
        previous = token
        continue
      }
      if (inlineRest && token.value !== '(' && token.value !== ')' && token.value !== ';' && !clause) {
        writeToken(token.value, !tightNext)
        tightNext = false
        previous = token
        continue
      }
      inlineRest = false
      if (token.value === ';') {
        writeToken(';', false)
        expectBody = false
        nextLineIndent = null
        betweenOpen = false
        breakLine()
        previous = token
        continue
      }
      if (isStructural(token) && SqlLexicon.inlineHeads.has(token.upper)) {
        expectBody = false
        nextLineIndent = null
        betweenOpen = false
        startLine(frame.clauseIndent)
        writeToken(token.value, false)
        frame = { ...frame, bodyList: false }
        inlineRest = true
        previous = token
        continue
      }
      if (clause) {
        expectBody = false
        nextLineIndent = null
        betweenOpen = false
        startLine(frame.clauseIndent)
        writeToken(token.value, false)
        frame = { ...frame, bodyList: SqlLexicon.bodyLists.has(token.upper) }
        expectBody = true
        previous = token
        continue
      }
      if (isStructural(token) && (token.upper === 'AND' || token.upper === 'OR')) {
        if (betweenOpen && token.upper === 'AND') {
          betweenOpen = false
          writeToken(token.value, true)
        } else {
          expectBody = false
          nextLineIndent = null
          startLine(frame.clauseIndent + 1)
          writeToken(token.value, false)
        }
        previous = token
        continue
      }
      if (token.value === '(') {
        const closing = SqlFormatter.#findClosing(tokens, index)
        const next = SqlFormatter.#nextSignificant(tokens, index + 1)
        const subquery = Boolean(next && (next.upper === 'SELECT' || next.upper === 'SELECT DISTINCT' || next.upper === 'WITH' || next.upper === 'WITH RECURSIVE'))
        const hasComma = SqlFormatter.#hasCommaBefore(tokens, index, closing)
        if (expectBody && subquery) startLine(frame.clauseIndent + 1)
        writeToken('(', expectBody && subquery ? false : expectBody ? true : SqlFormatter.#spaceBeforeParen(previous))
        expectBody = false
        const parent = frame
        if (subquery) {
          stack.push(parent)
          frame = { kind: 'subquery', clauseIndent: parent.clauseIndent + 2, bodyList: false, itemIndent: lineIndent + 1, closeIndent: lineIndent }
        } else if (hasComma) {
          stack.push(parent)
          frame = { kind: 'list', clauseIndent: parent.clauseIndent, bodyList: false, itemIndent: lineIndent + 1, closeIndent: lineIndent }
          nextLineIndent = frame.itemIndent
        } else {
          stack.push(parent)
          frame = { kind: 'group', clauseIndent: parent.clauseIndent, bodyList: false, itemIndent: lineIndent, closeIndent: lineIndent }
        }
        previous = token
        continue
      }
      if (token.value === ')') {
        if (stack.length === 0) throw new Error(FormatMessage.sqlParen)
        const closed = frame
        frame = stack.pop() ?? frame
        expectBody = false
        nextLineIndent = null
        if (closed.kind === 'subquery') {
          startLine(frame.clauseIndent + 1)
          writeToken(')', false)
        } else if (closed.kind === 'list') {
          startLine(closed.closeIndent)
          writeToken(')', false)
        } else writeToken(')', false)
        previous = token
        continue
      }
      if (token.value === ',') {
        writeToken(',', false)
        if (frame.kind === 'list') nextLineIndent = frame.itemIndent
        else if (frame.bodyList) nextLineIndent = frame.clauseIndent + 1
        previous = token
        continue
      }
      if (expectBody) {
        startLine(frame.clauseIndent + 1)
        expectBody = false
      } else if (nextLineIndent !== null) {
        startLine(nextLineIndent)
        nextLineIndent = null
      }
      if (token.value === '.' || token.value === '::' || token.value === '->' || token.value === '->>') {
        writeToken(token.value, false)
        tightNext = true
      } else if (token.value === '*') {
        const starTight = tightNext || previous?.value === '(' || previous?.value === '.'
        writeToken('*', !starTight)
        tightNext = false
      } else {
        writeToken(token.value, !tightNext)
        tightNext = false
        if (token.upper === 'BETWEEN') betweenOpen = true
      }
      previous = token
    }
    if (stack.length > 0) throw new Error(FormatMessage.sqlParen)
    if (lineHasText) lines.push(current.trimEnd())
    return lines.join('\n').trim()
  }

  static #findClosing(tokens: readonly SqlToken[], openIndex: number): number {
    let depth = 0
    for (let index = openIndex; index < tokens.length; index += 1) {
      if (tokens[index]?.value === '(') depth += 1
      if (tokens[index]?.value === ')') {
        depth -= 1
        if (depth === 0) return index
      }
    }
    return tokens.length - 1
  }

  static #hasCommaBefore(tokens: readonly SqlToken[], openIndex: number, closeIndex: number): boolean {
    let depth = 0
    for (let index = openIndex; index <= closeIndex; index += 1) {
      if (tokens[index]?.value === '(') depth += 1
      else if (tokens[index]?.value === ')') depth -= 1
      else if (tokens[index]?.value === ',' && depth === 1) return true
    }
    return false
  }

  static #nextSignificant(tokens: readonly SqlToken[], start: number): SqlToken | undefined {
    return tokens.slice(start).find((token) => token.kind !== 'comment')
  }
}
