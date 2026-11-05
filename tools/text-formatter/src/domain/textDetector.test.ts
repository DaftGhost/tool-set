import { describe, expect, it } from 'vitest'
import { FormatOptionsModel } from './formatModel'
import { FormatPreview } from './textFormatter'
import { TextDetector } from './textDetector'

const defaults = FormatOptionsModel.create()

describe('TextDetector', () => {
  it('returns null for empty text', () => {
    expect(TextDetector.detect('')).toBeNull()
    expect(TextDetector.detect(' \n\t ')).toBeNull()
  })

  it('detects JSON before XML and SQL', () => {
    expect(TextDetector.detect('{"sql":"SELECT 1"}')).toBe('json')
    expect(TextDetector.detect('"<root>SELECT 1</root>"')).toBe('json')
    expect(TextDetector.detect('true')).toBe('json')
    expect(TextDetector.detect('1')).toBe('json')
    expect(TextDetector.detect('null')).toBe('json')
  })

  it('detects XML before SQL', () => {
    expect(TextDetector.detect('<root>SELECT 1</root>')).toBe('xml')
    expect(TextDetector.detect('<?xml version="1.0"?><root/>')).toBe('xml')
  })

  it('detects SQL statements after JSON and XML fail', () => {
    expect(TextDetector.detect('SELECT 1')).toBe('sql')
    expect(TextDetector.detect('-- note\ninsert into t values (1)')).toBe('sql')
    expect(TextDetector.detect('with cte as (select 1) select * from cte')).toBe('sql')
  })

  it('returns null when the text is none of the three types', () => {
    expect(TextDetector.detect('hello')).toBeNull()
    expect(TextDetector.detect('{')).toBeNull()
    expect(TextDetector.detect('<root>')).toBeNull()
  })
})

describe('FormatPreview', () => {
  it('keeps the original text when detection fails', () => {
    expect(FormatPreview.render('hello', null, null)).toEqual({
      output: 'hello',
      error: '无法识别这段文本。目前只支持 JSON、XML 和 SQL。原文已保留。',
    })
  })

  it('keeps the original text when formatting fails', () => {
    const source = '{"a":1}'
    const result = FormatPreview.render(source, 'xml', defaults)
    expect(result.output).toBe(source)
    expect(result.error).toContain('XML 无法解析')
    expect(result.error).toContain('原文已保留')
  })

  it('returns no output for empty input', () => {
    expect(FormatPreview.render('  ', 'json', defaults)).toEqual({ output: '', error: '' })
  })
})
