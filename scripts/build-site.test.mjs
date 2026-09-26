import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { buildSite } from './build-site.mjs'

test('builds a registered browser tool into the site and writes its catalog entry', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-build-site-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  const outputDir = path.join(fixtureRoot, 'site')
  const toolDir = path.join(toolsDir, 'sample-tool')

  await mkdir(catalogDir, { recursive: true })
  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<main>Catalog</main>')
  await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'browser',
    category: 'API 费用估算',
    actionLabel: '开始测算',
    name: 'Sample Tool',
    summary: 'A sample browser tool.',
    build: {
      command: [process.execPath, '-e', "require('node:fs').mkdirSync('dist', { recursive: true }); require('node:fs').writeFileSync('dist/index.html', '<main>Sample</main>')"],
      outputDirectory: 'dist',
    },
  }))

  try {
    await buildSite({ toolsDir, catalogDir, outputDir })

    const manifest = JSON.parse(await readFile(path.join(outputDir, 'tools.json'), 'utf8'))
    assert.deepEqual(manifest, {
      schemaVersion: 1,
      tools: [{
        slug: 'sample-tool',
        category: 'API 费用估算',
        actionLabel: '开始测算',
        name: 'Sample Tool',
        summary: 'A sample browser tool.',
        href: './tools/sample-tool/',
      }],
    })
    assert.equal(await readFile(path.join(outputDir, 'index.html'), 'utf8'), '<main>Catalog</main>')
    assert.equal(await readFile(path.join(outputDir, 'tools', 'sample-tool', 'index.html'), 'utf8'), '<main>Sample</main>')
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('builds every registered browser tool and writes entries in slug order', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-build-site-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  const outputDir = path.join(fixtureRoot, 'site')

  await mkdir(catalogDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<main>Catalog</main>')

  for (const slug of ['zeta-tool', 'alpha-tool']) {
    const toolDir = path.join(toolsDir, slug)
    await mkdir(toolDir, { recursive: true })
    await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify({
      schemaVersion: 1,
      kind: 'browser',
      category: 'API 费用估算',
      actionLabel: '开始测算',
      name: slug,
      summary: `${slug} summary`,
      build: {
        command: [process.execPath, '-e', `const fs = require('node:fs'); fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/index.html', '${slug}')`],
        outputDirectory: 'dist',
      },
    }))
  }

  try {
    await buildSite({ toolsDir, catalogDir, outputDir })

    const manifest = JSON.parse(await readFile(path.join(outputDir, 'tools.json'), 'utf8'))
    assert.deepEqual(manifest.tools.map((tool) => tool.slug), ['alpha-tool', 'zeta-tool'])
    assert.equal(await readFile(path.join(outputDir, 'tools', 'alpha-tool', 'index.html'), 'utf8'), 'alpha-tool')
    assert.equal(await readFile(path.join(outputDir, 'tools', 'zeta-tool', 'index.html'), 'utf8'), 'zeta-tool')
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('reports the tool metadata path when its JSON is invalid', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-build-site-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  const outputDir = path.join(fixtureRoot, 'site')
  const toolDir = path.join(toolsDir, 'broken-tool')

  await mkdir(catalogDir, { recursive: true })
  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<main>Catalog</main>')
  await writeFile(path.join(toolDir, 'tool.json'), '{')

  try {
    await assert.rejects(
      buildSite({ toolsDir, catalogDir, outputDir }),
      (error) => error.message.includes(path.join(toolDir, 'tool.json')),
    )
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('rejects unsupported or incomplete tool metadata before writing a publishable catalog', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-build-site-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  const outputDir = path.join(fixtureRoot, 'site')
  const toolDir = path.join(toolsDir, 'invalid-tool')
  const metadataPath = path.join(toolDir, 'tool.json')
  const invalidFields = [
    ['schemaVersion', { schemaVersion: 2 }],
    ['kind', { kind: 'cli' }],
    ['category', { category: '   ' }],
    ['actionLabel', { actionLabel: '   ' }],
    ['name', { name: '   ' }],
    ['summary', { summary: '   ' }],
    ['build.command', { build: { command: 'node -e "process.exit(0)"' } }],
    ['build.command', { build: { command: [] } }],
    ['build.install', { build: { install: [''] } }],
    ['build.outputDirectory', { build: { outputDirectory: '../outside' } }],
  ]

  await mkdir(catalogDir, { recursive: true })
  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<main>Catalog</main>')

  try {
    for (const [field, override] of invalidFields) {
      const metadata = {
        schemaVersion: 1,
        kind: 'browser',
        category: 'API 费用估算',
        actionLabel: '开始测算',
        name: 'Invalid Tool',
        summary: 'A valid summary.',
        build: {
          command: [process.execPath, '-e', "require('node:fs').mkdirSync('dist', { recursive: true }); require('node:fs').writeFileSync('dist/index.html', 'tool')"],
          outputDirectory: 'dist',
        },
      }
      if (override.build) Object.assign(metadata.build, override.build)
      else Object.assign(metadata, override)
      await writeFile(metadataPath, JSON.stringify(metadata))

      await assert.rejects(
        buildSite({ toolsDir, catalogDir, outputDir }),
        (error) => error.message.includes(metadataPath) && error.message.includes(field),
      )
      await assert.rejects(readFile(path.join(outputDir, 'tools.json')))
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('identifies the tool when its build command fails and does not write tools.json', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-build-site-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  const outputDir = path.join(fixtureRoot, 'site')
  const toolDir = path.join(toolsDir, 'failing-tool')
  const command = [process.execPath, '-e', 'process.exit(7)']

  await mkdir(catalogDir, { recursive: true })
  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<main>Catalog</main>')
  await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'browser',
    category: 'API 费用估算',
    actionLabel: '开始测算',
    name: 'Failing Tool',
    summary: 'A tool whose build fails.',
    build: { command, outputDirectory: 'dist' },
  }))

  try {
    await assert.rejects(
      buildSite({ toolsDir, catalogDir, outputDir }),
      (error) => error.message.includes(toolDir) && error.message.includes(command.join(' ')),
    )
    await assert.rejects(readFile(path.join(outputDir, 'tools.json')))
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('identifies the tool when its install command fails and does not write tools.json', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-build-site-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  const outputDir = path.join(fixtureRoot, 'site')
  const toolDir = path.join(toolsDir, 'install-failing-tool')

  await mkdir(catalogDir, { recursive: true })
  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<main>Catalog</main>')
  await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'browser',
    category: 'API 费用估算',
    actionLabel: '开始测算',
    name: 'Install Failing Tool',
    summary: 'A tool whose install command fails.',
    build: {
      install: [process.execPath, '-e', 'process.exit(9)'],
      command: [process.execPath, '-e', 'process.exit(0)'],
      outputDirectory: 'dist',
    },
  }))

  try {
    await assert.rejects(
      buildSite({ toolsDir, catalogDir, outputDir }),
      (error) => error.message.includes(toolDir) && error.message.includes('build.install'),
    )
    await assert.rejects(readFile(path.join(outputDir, 'tools.json')))
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('rejects tool outputs without index.html before writing tools.json', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-build-site-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  const outputDir = path.join(fixtureRoot, 'site')
  const toolDir = path.join(toolsDir, 'incomplete-tool')
  const buildScripts = [
    'process.exit(0)',
    "require('node:fs').mkdirSync('dist', { recursive: true }); require('node:fs').writeFileSync('dist/README.md', 'missing page')",
  ]

  await mkdir(catalogDir, { recursive: true })
  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<main>Catalog</main>')

  try {
    for (const script of buildScripts) {
      await rm(path.join(toolDir, 'dist'), { recursive: true, force: true })
      await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify({
        schemaVersion: 1,
        kind: 'browser',
        category: 'API 费用估算',
        actionLabel: '开始测算',
        name: 'Incomplete Tool',
        summary: 'A tool with no page output.',
        build: { command: [process.execPath, '-e', script], outputDirectory: 'dist' },
      }))

      await assert.rejects(
        buildSite({ toolsDir, catalogDir, outputDir }),
        (error) => error.message.includes(toolDir) && error.message.includes('index.html'),
      )
      await assert.rejects(readFile(path.join(outputDir, 'tools.json')))
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('rejects unregistered tool output created during a registered tool build', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-build-site-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  const outputDir = path.join(fixtureRoot, 'site')
  const toolDir = path.join(toolsDir, 'registered-tool')
  const buildScript = [
    "const fs = require('node:fs')",
    "fs.mkdirSync('dist', { recursive: true })",
    "fs.writeFileSync('dist/index.html', 'registered')",
    "fs.mkdirSync('../../site/tools/unregistered-tool', { recursive: true })",
    "fs.writeFileSync('../../site/tools/unregistered-tool/index.html', 'unregistered')",
  ].join('; ')

  await mkdir(catalogDir, { recursive: true })
  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<main>Catalog</main>')
  await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'browser',
    category: 'API 费用估算',
    actionLabel: '开始测算',
    name: 'Registered Tool',
    summary: 'A registered browser tool.',
    build: { command: [process.execPath, '-e', buildScript], outputDirectory: 'dist' },
  }))

  try {
    await assert.rejects(
      buildSite({ toolsDir, catalogDir, outputDir }),
      (error) => error.message.includes('unregistered-tool'),
    )
    await assert.rejects(readFile(path.join(outputDir, 'tools.json')))
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

test('does not clear an output directory that overlaps the tool source directory', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'tool-set-build-site-'))
  const toolsDir = path.join(fixtureRoot, 'tools')
  const catalogDir = path.join(fixtureRoot, 'catalog')
  const toolDir = path.join(toolsDir, 'protected-tool')
  const metadataPath = path.join(toolDir, 'tool.json')

  await mkdir(catalogDir, { recursive: true })
  await mkdir(toolDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<main>Catalog</main>')
  await writeFile(metadataPath, '{"protected":true}')

  try {
    await assert.rejects(
      buildSite({ toolsDir, catalogDir, outputDir: toolsDir }),
      /output directory.*overlap/i,
    )
    assert.equal(await readFile(metadataPath, 'utf8'), '{"protected":true}')
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})
