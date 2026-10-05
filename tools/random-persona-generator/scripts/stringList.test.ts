import { describe, expect, it } from 'vitest'
import { parseStringList } from '../src/stringList.ts'

describe('source string-list decoding', () => {
  it('handles Python and JSON quoting, escaped apostrophes, Unicode, commas, newlines and trailing commas', () => {
    expect(parseStringList("['a,b', \"Driver's job\", 'line\\nnext', 'caf\\u00e9', 'it\\\'s',]")).toEqual(['a,b', "Driver's job", 'line\nnext', 'café', "it's"])
    expect(parseStringList('["a", "b"]')).toEqual(['a', 'b'])
    expect(parseStringList('[]')).toEqual([])
    expect(parseStringList("['x' 'y', \"a\"\"b\"]")).toEqual(['xy', 'ab'])
  })
  it('rejects executable expressions, non-string members, nested lists and trailing content', () => {
    for (const value of ["[__import__('os').system('x')]", '[None]', '[1]', '[["a"]]', "['x'] + ['y']", "['unterminated]", "['x' * 2]"]) expect(() => parseStringList(value)).toThrow()
  })
})
