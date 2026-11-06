import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { BrowserClipboard } from '../shared/browser-clipboard/browserClipboard.ts'
import { FormatterButtons } from '../tools/text-formatter/src/components/formatterButtons.ts'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

class SourceFiles {
  static collect(directory) {
    const files = []
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'site' || entry.name === '.git') continue
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) files.push(...SourceFiles.collect(fullPath))
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(fullPath)
    }
    return files
  }

  static relative(file) {
    return path.relative(repositoryRoot, file).split(path.sep).join('/')
  }
}

test('BrowserClipboard is the only clipboard writer', () => {
  const owners = SourceFiles.collect(repositoryRoot).filter((file) => {
    const source = readFileSync(file, 'utf8')
    return /class BrowserClipboard\b/.test(source) || /navigator\.clipboard/.test(source)
  })
  assert.deepEqual(owners.map(SourceFiles.relative).sort(), ['shared/browser-clipboard/browserClipboard.ts'])
  assert.deepEqual(
    Object.getOwnPropertyNames(BrowserClipboard.prototype).filter((name) => name !== 'constructor'),
    ['copy'],
  )
})

test('BrowserClipboard writes text and rejects a missing clipboard', async () => {
  const clipboard = new BrowserClipboard()
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const install = (navigator) => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, enumerable: true, writable: true, value: navigator })
  }
  try {
    let written = ''
    install({ clipboard: { writeText: async (value) => { written = value } } })
    await clipboard.copy('人物档案')
    assert.equal(written, '人物档案')

    install({ clipboard: { writeText: async () => { throw new Error('denied') } } })
    await assert.rejects(clipboard.copy('x'), { message: 'denied' })

    for (const navigator of [undefined, {}, { clipboard: {} }, { clipboard: { writeText: undefined } }]) {
      install(navigator)
      await assert.rejects(clipboard.copy('x'), { message: 'Clipboard access is unavailable' })
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    else delete globalThis.navigator
  }
})

test('formatter quiet and primary button classes have one owner', () => {
  assert.deepEqual(
    Object.getOwnPropertyNames(FormatterButtons).filter((name) => !['length', 'name', 'prototype'].includes(name)).sort(),
    ['primary', 'quiet'],
  )
  const quiet = FormatterButtons.quiet()
  const primary = FormatterButtons.primary()
  const sources = SourceFiles.collect(repositoryRoot)
  const owners = sources.filter((file) => {
    const source = readFileSync(file, 'utf8')
    return source.includes(quiet) || source.includes(primary)
  })
  assert.deepEqual(owners.map(SourceFiles.relative).sort(), ['tools/text-formatter/src/components/formatterButtons.ts'])

  const formatterSources = SourceFiles.collect(path.join(repositoryRoot, 'tools/text-formatter'))
  const legacy = formatterSources.filter((file) => {
    const source = readFileSync(file, 'utf8')
    return source.includes('hover:border-primary-deep hover:bg-primary-deep') || /const (quiet|primary)Button\b/.test(source)
  })
  assert.deepEqual(legacy, [])
})
