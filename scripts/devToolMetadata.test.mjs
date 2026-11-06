import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildSite } from './build-site.mjs'
import { ToolMetadata } from './devToolMetadata.mjs'

function baseMetadata() {
  return {
    schemaVersion: 1,
    kind: 'browser',
    category: 'API 费用估算',
    actionLabel: '开始测算',
    name: 'Sample Tool',
    summary: 'A sample browser tool.',
    dev: {
      command: [process.execPath, '-e', 'process.exit(0)', '{port}', '{basePath}'],
      hmr: false,
      watch: ['src'],
    },
    build: {
      command: [process.execPath, '-e', 'process.exit(0)'],
      outputDirectory: 'dist',
    },
  }
}

function thrownBy(fn) {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('Expected the call to throw')
}

async function rejectedBy(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected the call to reject')
}

test('isWithin accepts a directory and its children and rejects escapes and prefix cousins', () => {
  const parent = path.join(os.tmpdir(), 'tool-set-within', 'tool')
  assert.equal(ToolMetadata.isWithin(parent, parent), true)
  assert.equal(ToolMetadata.isWithin(parent, path.join(parent, 'dist', 'index.html')), true)
  assert.equal(ToolMetadata.isWithin(parent, path.resolve(parent, 'dist', '..', 'src')), true)
  assert.equal(ToolMetadata.isWithin(parent, path.resolve(parent, '..')), false)
  assert.equal(ToolMetadata.isWithin(parent, path.resolve(parent, '..', 'outside')), false)
  assert.equal(ToolMetadata.isWithin(parent, `${parent}-extra`), false)
})

test('readDevelopmentTools returns the public catalog fields for a valid tool.json', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-tool-metadata-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const toolDir = path.join(toolsDir, 'sample-tool')
  const metadata = baseMetadata()

  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify(metadata))

  try {
    const tools = await ToolMetadata.readDevelopmentTools(toolsDir)
    assert.deepEqual(tools.map(({ slug, category, actionLabel, name, summary }) => ({
      slug,
      category,
      actionLabel,
      name,
      summary,
    })), [{
      slug: 'sample-tool',
      category: metadata.category,
      actionLabel: metadata.actionLabel,
      name: metadata.name,
      summary: metadata.summary,
    }])
    assert.deepEqual(tools[0].watchPaths, [path.resolve(toolDir, 'src')])
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('development startup and site build reject the same public tool.json fields', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-tool-metadata-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  const outputDir = path.join(fixtureRoot, 'site')
  const cases = [
    ['sample-tool', { ...baseMetadata(), schemaVersion: 2 }, 'schemaVersion must be 1'],
    ['sample-tool', { ...baseMetadata(), kind: 'cli' }, 'kind must be "browser"'],
    ['sample-tool', { ...baseMetadata(), category: '   ' }, 'category must be a non-empty string'],
    ['sample-tool', { ...baseMetadata(), category: 1 }, 'category must be a non-empty string'],
    ['sample-tool', { ...baseMetadata(), actionLabel: '   ' }, 'actionLabel must be a non-empty string'],
    ['sample-tool', { ...baseMetadata(), name: '   ' }, 'name must be a non-empty string'],
    ['sample-tool', { ...baseMetadata(), summary: '   ' }, 'summary must be a non-empty string'],
    ['Bad-Slug', baseMetadata(), 'directory name must contain lowercase letters, numbers, and single hyphens'],
    ['sample-tool', [], 'root must be a JSON object'],
  ]

  await mkdir(catalogDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<main>Catalog</main>')

  try {
    for (const [slug, metadata, detail] of cases) {
      const toolDir = path.join(toolsDir, slug)
      const metadataPath = path.join(toolDir, 'tool.json')
      await rm(toolsDir, { recursive: true, force: true })
      await mkdir(toolDir, { recursive: true })
      const raw = JSON.stringify(metadata)
      await writeFile(metadataPath, raw)
      const parsed = JSON.parse(raw)
      const expected = `Invalid tool metadata at ${metadataPath}: ${detail}`

      const directError = thrownBy(() => ToolMetadata.validatePublicFields(parsed, slug, metadataPath))
      const devError = await rejectedBy(ToolMetadata.readDevelopmentTools(toolsDir))
      const buildError = await rejectedBy(buildSite({ toolsDir, catalogDir, outputDir }))

      assert.equal(directError.message, expected)
      assert.equal(devError.message, expected)
      assert.equal(buildError.message, expected)
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('development registration still rejects an incomplete dev block when public fields pass', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-tool-metadata-'))
  const toolDir = path.join(fixtureRoot, 'tools', 'sample-tool')
  const metadata = baseMetadata()
  metadata.dev = { command: 'pnpm dev', hmr: false, watch: ['src'] }

  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify(metadata))

  try {
    const error = await rejectedBy(ToolMetadata.readDevelopmentTools(path.join(fixtureRoot, 'tools')))
    assert.match(error.message, /dev\.command must be a non-empty array of command arguments/)
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('development registration rejects a watch path that escapes the tool directory', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-tool-metadata-'))
  const toolDir = path.join(fixtureRoot, 'tools', 'sample-tool')
  const metadata = baseMetadata()
  metadata.dev.watch = ['../outside']

  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify(metadata))

  try {
    const error = await rejectedBy(ToolMetadata.readDevelopmentTools(path.join(fixtureRoot, 'tools')))
    assert.match(error.message, /dev\.watch paths must not escape the tool directory/)
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('keeps public tool.json checks and isWithin defined only on ToolMetadata', async () => {
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
  const markers = [
    'static isWithin',
    "relative !== '..'",
    'must be a non-empty string',
    'must contain lowercase letters, numbers, and single hyphens',
    'must be "browser"',
  ]
  const copies = []

  for (const name of await readdir(scriptsDir)) {
    if (!name.endsWith('.mjs') || name.endsWith('.test.mjs') || name === 'devToolMetadata.mjs') continue
    const source = await readFile(path.join(scriptsDir, name), 'utf8')
    if (source.includes('function isWithin')) copies.push(`${name} defines function isWithin`)
    for (const marker of markers) {
      if (source.includes(marker)) copies.push(`${name} contains ${marker}`)
    }
  }

  assert.deepEqual(copies, [])
  const owner = await readFile(path.join(scriptsDir, 'devToolMetadata.mjs'), 'utf8')
  for (const marker of markers) assert.equal(owner.includes(marker), true, marker)
  assert.equal(owner.includes('function isWithin'), false)
})
