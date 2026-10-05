// Parse only a list of ordinary quoted strings. No expression evaluation or comma splitting.
export function parseStringList(input: string): string[] {
  let cursor = 0
  const skipSpace = () => { while (/\s/.test(input[cursor] ?? '') && cursor < input.length) cursor += 1 }
  const requireCharacter = (character: string) => {
    skipSpace()
    if (input[cursor++] !== character) throw new Error('Invalid string list')
  }
  requireCharacter('[')
  const result: string[] = []
  skipSpace()
  while (input[cursor] !== ']') {
    let item = ''
    do {
      const token = /'((?:\\[\s\S]|[^'\\\r\n])*)'|"((?:\\[\s\S]|[^"\\\r\n])*)"/y
      token.lastIndex = cursor
      const match = token.exec(input)
      if (!match) throw new Error('Expected a quoted list item')
      cursor = token.lastIndex
      item += decodeEscapes(match[1] ?? match[2])
      skipSpace()
    } while (input[cursor] === "'" || input[cursor] === '"')
    result.push(item)
    if (input[cursor] === ']') break
    requireCharacter(',')
    skipSpace()
  }
  requireCharacter(']')
  skipSpace()
  if (cursor !== input.length) throw new Error('Trailing list content')
  return result
}

function decodeEscapes(value: string) {
  const escapes: Record<string, string> = { '\\': '\\', "'": "'", '"': '"', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\x07', '\n': '' }
  return value.replace(/\\(U[0-9a-fA-F]{8}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[0-7]{1,3}|[\s\S])/g, (_, escape: string) => {
    if (Object.hasOwn(escapes, escape)) return escapes[escape]
    if (/^[Uux]/.test(escape)) {
      if (escape.length === 1) throw new Error('Incomplete escape sequence')
      return String.fromCodePoint(Number.parseInt(escape.slice(1), 16))
    }
    if (/^[0-7]/.test(escape)) return String.fromCodePoint(Number.parseInt(escape, 8))
    return `\\${escape}`
  })
}
