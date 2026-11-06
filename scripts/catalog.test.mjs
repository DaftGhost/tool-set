import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CatalogCards, CatalogSearch, loadCatalogData } from '../catalog/src/catalog.ts'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const tools = [
  { slug: 'first-tool', category: 'API 费用估算', actionLabel: '开始测算', name: 'First tool', summary: 'Estimate costs.', href: './tools/first-tool/' },
  { slug: 'second-tool', category: 'API 费用估算', actionLabel: '开始测算', name: 'Second tool', summary: 'Compare costs.', href: './tools/second-tool/' },
  { slug: 'writing-tool', category: '文本处理', actionLabel: '编辑文本', name: 'Writing tool', summary: 'Edit text.', href: './tools/writing-tool/' },
]

test('loads a valid manifest', async () => {
  const requestedUrls = []
  const loadedTools = await loadCatalogData(async (url) => {
    requestedUrls.push(url)
    return { ok: true, json: async () => ({ schemaVersion: 1, tools }) }
  })

  assert.deepEqual(requestedUrls, ['./tools.json'])
  assert.deepEqual(loadedTools, tools)
})

test('filters tools by name, summary, category, or card tag', () => {
  assert.deepEqual(CatalogSearch.filter(tools, '  FIRST '), [tools[0]])
  assert.deepEqual(CatalogSearch.filter(tools, 'compare'), [tools[1]])
  assert.deepEqual(CatalogSearch.filter(tools, '文本'), [tools[2]])
  assert.deepEqual(CatalogSearch.filter(tools, '开始测算'), tools.slice(0, 2))
  assert.deepEqual(CatalogSearch.filter(tools, '   '), tools)
  assert.deepEqual(CatalogSearch.filter(tools, 'missing'), [])
  assert.deepEqual(CatalogCards.tagsFor(tools[0]), ['API 费用估算', '开始测算'])
  assert.equal(CatalogCards.glyphFor(tools[0]), 'square')
  assert.deepEqual(CatalogCards.tagsFor({
    ...tools[0],
    slug: 'llm-api-cost-calculator',
  }), ['多方案对比', 'USD / CNY', '图表'])
  assert.equal(CatalogCards.glyphFor({
    ...tools[0],
    slug: 'llm-api-cost-calculator',
  }), 'yen')
})

test('catalog card glyph and tags share one table that matches registered tools', () => {
  const slugs = readdirSync(path.join(repositoryRoot, 'tools'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(repositoryRoot, 'tools', entry.name, 'tool.json')))
    .map((entry) => entry.name)
    .sort()
  const glyphs = new Set(CatalogCards.glyphs)

  const cardSource = readFileSync(path.join(repositoryRoot, 'catalog/src/App.tsx'), 'utf8')

  assert.deepEqual(Object.keys(CatalogCards.entries).sort(), slugs)
  for (const slug of slugs) {
    const entry = CatalogCards.entries[slug]
    assert.equal(glyphs.has(entry.glyph), true, slug)
    assert.equal(cardSource.includes(`glyph === '${entry.glyph}'`), true, slug)
    assert.deepEqual(entry.tags.filter((tag) => tag.trim() !== ''), entry.tags, slug)
    assert.ok(entry.tags.length > 0, slug)
  }
  assert.equal(cardSource.includes('CatalogCards.glyphFor(tool)'), true)
})

test('accepts an empty manifest', async () => {
  const loadedTools = await loadCatalogData(async () => ({
    ok: true,
    json: async () => ({ schemaVersion: 1, tools: [] }),
  }))

  assert.deepEqual(loadedTools, [])
})

test('rejects request failures and malformed manifests', async (t) => {
  await t.test('non-success status', async () => {
    await assert.rejects(
      loadCatalogData(async () => ({ ok: false, status: 503 })),
      /503/,
    )
  })

  await t.test('unsupported schema', async () => {
    await assert.rejects(
      loadCatalogData(async () => ({ ok: true, json: async () => ({ schemaVersion: 2, tools: [] }) })),
      /Invalid tools manifest/,
    )
  })

  await t.test('incomplete tool entry', async () => {
    await assert.rejects(
      loadCatalogData(async () => ({
        ok: true,
        json: async () => ({ schemaVersion: 1, tools: [{ ...tools[0], summary: undefined }] }),
      })),
      /Invalid tool entry/,
    )
  })
})
