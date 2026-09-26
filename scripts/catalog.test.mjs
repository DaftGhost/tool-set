import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupCatalogTools, loadCatalogData } from '../catalog/src/catalog.ts'

const tools = [
  { slug: 'first-tool', category: 'API 费用估算', actionLabel: '开始测算', name: 'First tool', summary: 'Estimate costs.', href: './tools/first-tool/' },
  { slug: 'second-tool', category: 'API 费用估算', actionLabel: '开始测算', name: 'Second tool', summary: 'Compare costs.', href: './tools/second-tool/' },
  { slug: 'writing-tool', category: '文本处理', actionLabel: '编辑文本', name: 'Writing tool', summary: 'Edit text.', href: './tools/writing-tool/' },
]

test('loads a valid manifest and groups tools in first-seen category order', async () => {
  const requestedUrls = []
  const loadedTools = await loadCatalogData(async (url) => {
    requestedUrls.push(url)
    return { ok: true, json: async () => ({ schemaVersion: 1, tools }) }
  })

  assert.deepEqual(requestedUrls, ['./tools.json'])
  assert.deepEqual(groupCatalogTools(loadedTools), [
    { category: 'API 费用估算', tools: tools.slice(0, 2) },
    { category: '文本处理', tools: tools.slice(2) },
  ])
})

test('accepts an empty manifest and returns no groups', async () => {
  const loadedTools = await loadCatalogData(async () => ({
    ok: true,
    json: async () => ({ schemaVersion: 1, tools: [] }),
  }))

  assert.deepEqual(loadedTools, [])
  assert.deepEqual(groupCatalogTools(loadedTools), [])
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
