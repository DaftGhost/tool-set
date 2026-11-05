import { describe, expect, it } from 'vitest'
import { FormatOptionsModel, type FormatOptions } from './formatModel'
import { JsonFormatter } from './jsonFormatter'
import { SqlFormatter } from './sqlFormatter'
import { TextFormatter } from './textFormatter'
import { XmlFormatter } from './xmlFormatter'

const defaults = FormatOptionsModel.create()

function options(patch: Partial<FormatOptions>): FormatOptions {
  return { ...defaults, ...patch }
}

describe('JsonFormatter', () => {
  const source = '{"b":1,"a":{"d":2,"c":[1,{"z":1,"y":2}]}}'

  it('pretty-prints with one tab and keeps key order', () => {
    expect(JsonFormatter.format(source, defaults)).toBe([
      '{',
      '\t"b": 1,',
      '\t"a": {',
      '\t\t"d": 2,',
      '\t\t"c": [',
      '\t\t\t1,',
      '\t\t\t{',
      '\t\t\t\t"z": 1,',
      '\t\t\t\t"y": 2',
      '\t\t\t}',
      '\t\t]',
      '\t}',
      '}',
    ].join('\n'))
  })

  it('sorts keys only while pretty-printing', () => {
    expect(JsonFormatter.format(source, options({ sortKeys: true }))).toBe([
      '{',
      '\t"a": {',
      '\t\t"c": [',
      '\t\t\t1,',
      '\t\t\t{',
      '\t\t\t\t"y": 2,',
      '\t\t\t\t"z": 1',
      '\t\t\t}',
      '\t\t],',
      '\t\t"d": 2',
      '\t},',
      '\t"b": 1',
      '}',
    ].join('\n'))
    expect(JsonFormatter.format(source, options({ compress: true, sortKeys: true }))).toBe(source)
  })

  it('minifies to one line and can indent with spaces', () => {
    expect(JsonFormatter.format('{"b":1,"a":2}', options({ compress: true }))).toBe('{"b":1,"a":2}')
    expect(JsonFormatter.format('{"b":1,"a":2}', options({ indent: 'space-2' }))).toBe('{\n  "b": 1,\n  "a": 2\n}')
  })

  it('throws for malformed JSON', () => {
    expect(() => JsonFormatter.format('{', defaults)).toThrow(/JSON 无法解析/)
  })
})

describe('XmlFormatter', () => {
  const source = '<?xml version="1.0" encoding="UTF-8"?>\n<root id="1"><child>你好</child><!-- note --><empty/></root>'

  it('pretty-prints with one tab', () => {
    expect(XmlFormatter.format(source, defaults)).toBe([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<root id="1">',
      '\t<child>你好</child>',
      '\t<!-- note -->',
      '\t<empty/>',
      '</root>',
    ].join('\n'))
  })

  it('minifies to one line and can indent with four spaces', () => {
    expect(XmlFormatter.format(source, options({ compress: true }))).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><root id="1"><child>你好</child><!-- note --><empty/></root>',
    )
    expect(XmlFormatter.format('<root><child>1</child></root>', options({ indent: 'space-4' }))).toBe(
      '<root>\n    <child>1</child>\n</root>',
    )
  })

  it('throws for mismatched or unclosed tags', () => {
    expect(() => XmlFormatter.format('<root></item>', defaults)).toThrow(/XML 无法解析/)
    expect(() => XmlFormatter.format('<root>', defaults)).toThrow(/XML 无法解析/)
  })
})

describe('SqlFormatter', () => {
  it('lowercases the entire pretty-printed statement and indents with one tab', () => {
    expect(SqlFormatter.format(
      "SELECT u.Id, u.Name FROM Users AS u WHERE u.Status = 'Active' AND u.Id > 1 ORDER BY u.Id ASC",
      defaults,
    )).toBe([
      'select',
      '\tu.id,',
      '\tu.name',
      'from',
      '\tusers as u',
      'where',
      "\tu.status = 'active'",
      '\tand u.id > 1',
      'order by',
      '\tu.id asc',
    ].join('\n'))
  })

  it('uppercases only keywords when that casing is selected', () => {
    expect(SqlFormatter.format(
      "SELECT Name FROM T WHERE Name = 'Active'",
      options({ sqlCasing: 'keyword-upper' }),
    )).toBe([
      'SELECT',
      '\tName',
      'FROM',
      '\tT',
      'WHERE',
      "\tName = 'Active'",
    ].join('\n'))
  })

  it('minifies to one line without changing case', () => {
    expect(SqlFormatter.format(
      "SELECT Name FROM T WHERE Name = 'Active'",
      options({ compress: true, sqlCasing: 'lower' }),
    )).toBe("SELECT Name FROM T WHERE Name = 'Active'")
  })

  it('indents subqueries, joins, and insert lists', () => {
    expect(SqlFormatter.format('SELECT id FROM (SELECT id FROM t) AS s', options({ indent: 'space-2' }))).toBe([
      'select',
      '  id',
      'from',
      '  (',
      '    select',
      '      id',
      '    from',
      '      t',
      '  ) as s',
    ].join('\n'))

    expect(SqlFormatter.format(
      'select a.id from a inner join b on a.id = b.id',
      defaults,
    )).toBe([
      'select',
      '\ta.id',
      'from',
      '\ta',
      'inner join',
      '\tb on a.id = b.id',
    ].join('\n'))

    expect(SqlFormatter.format("INSERT INTO Users (Id, Name) VALUES (1, 'Ann')", defaults)).toBe([
      'insert into users (',
      '\tid,',
      '\tname',
      ')',
      'values (',
      '\t1,',
      "\t'ann'",
      ')',
    ].join('\n'))
  })

  it('throws for text that is not a SQL statement', () => {
    expect(() => SqlFormatter.format('hello', defaults)).toThrow(/SQL 无法识别/)
  })
})

describe('TextFormatter', () => {
  it('dispatches each kind to its formatter', () => {
    expect(TextFormatter.format('json', '{"a":1}', options({ compress: true }))).toBe('{"a":1}')
    expect(TextFormatter.format('xml', '<root/>', options({ compress: true }))).toBe('<root/>')
    expect(TextFormatter.format('sql', 'SELECT 1', options({ compress: true }))).toBe('SELECT 1')
  })
})
