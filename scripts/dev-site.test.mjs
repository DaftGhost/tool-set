import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { startDevelopmentSite } from './dev-site.mjs'

const fakeToolServer = [
  "const http = require('node:http')",
  "const fs = require('node:fs')",
  'const port = Number(process.argv[1])',
  'const basePath = process.argv[2]',
  'const markerPath = process.argv[3]',
  "const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<!doctype html><html><body><main>Sample tool</main></body></html>') })",
  "server.listen(port, '127.0.0.1', () => fs.writeFileSync(markerPath, JSON.stringify({ port, basePath })))",
].join('; ')

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tool-set-dev-site-'))
  const toolsDir = path.join(root, 'tools')
  const toolDir = path.join(toolsDir, 'sample-tool')
  const catalogDir = path.join(root, 'catalog')
  const markerPath = path.join(root, 'tool-server.json')

  await mkdir(path.join(toolDir, 'src'), { recursive: true })
  await mkdir(catalogDir, { recursive: true })
  await writeFile(path.join(catalogDir, 'index.html'), '<!doctype html><html><body><main>Utilities</main></body></html>')
  await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'browser',
    category: 'Sample utilities',
    actionLabel: 'Open sample',
    name: 'Sample utility',
    summary: 'A utility for testing the root development address.',
    dev: {
      command: [process.execPath, '-e', fakeToolServer, '{port}', '{basePath}', markerPath],
      environment: {},
      hmr: false,
      watch: ['src'],
    },
  }))

  return { root, toolsDir, catalogDir, markerPath }
}

test('serves the catalog and metadata-registered tools through one development address', async () => {
  const fixture = await createFixture()
  let developmentSite

  try {
    developmentSite = await startDevelopmentSite({
      toolsDir: fixture.toolsDir,
      catalogDir: fixture.catalogDir,
      host: '127.0.0.1',
      port: 0,
      readinessTimeoutMs: 5000,
    })

    const catalogResponse = await fetch(developmentSite.url)
    assert.equal(catalogResponse.status, 200)
    assert.match(await catalogResponse.text(), /Utilities/)

    const manifestResponse = await fetch(new URL('/tools.json', developmentSite.url))
    const manifest = await manifestResponse.json()
    assert.deepEqual(manifest.tools.map(({ slug, category, actionLabel, href }) => ({ slug, category, actionLabel, href })), [{
      slug: 'sample-tool',
      category: 'Sample utilities',
      actionLabel: 'Open sample',
      href: './tools/sample-tool/',
    }])

    const toolResponse = await fetch(new URL('/tools/sample-tool/', developmentSite.url))
    const toolHtml = await toolResponse.text()
    assert.equal(toolResponse.status, 200)
    assert.match(toolHtml, /Sample tool/)
    assert.match(toolHtml, /__tool_reload\.js/)

    await developmentSite.close()
    developmentSite = undefined

    const childServer = JSON.parse(await readFile(fixture.markerPath, 'utf8'))
    await assert.rejects(fetch(`http://127.0.0.1:${childServer.port}${childServer.basePath}`))
  } finally {
    await developmentSite?.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('reloads a non-HMR tool after a watched source file changes', async () => {
  const fixture = await createFixture()
  let developmentSite
  let eventStream

  try {
    developmentSite = await startDevelopmentSite({
      toolsDir: fixture.toolsDir,
      catalogDir: fixture.catalogDir,
      host: '127.0.0.1',
      port: 0,
      readinessTimeoutMs: 5000,
    })

    const response = await fetch(new URL('/__tool_reload/events?tool=sample-tool', developmentSite.url))
    assert.equal(response.status, 200)
    eventStream = response.body.getReader()
    await eventStream.read()
    await writeFile(path.join(fixture.toolsDir, 'sample-tool', 'src', 'changed.js'), 'export const changed = true')

    let timeout
    const nextEvent = await Promise.race([
      eventStream.read(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Timed out waiting for the reload event')), 5000) }),
    ])
    clearTimeout(timeout)
    assert.match(new TextDecoder().decode(nextEvent.value), /event: reload/)
  } finally {
    await eventStream?.cancel()
    await developmentSite?.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('names a failed tool and stops sibling tool processes during startup cleanup', async () => {
  const fixture = await createFixture()
  const toolDir = path.join(fixture.toolsDir, 'broken-tool')
  await mkdir(path.join(toolDir, 'src'), { recursive: true })
  await writeFile(path.join(toolDir, 'tool.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'browser',
    category: 'Sample utilities',
    actionLabel: 'Open broken',
    name: 'Broken sample utility',
    summary: 'A test tool that exits during startup.',
    dev: {
      command: [process.execPath, '-e', 'process.exit(23)', '{port}', '{basePath}'],
      install: ['pnpm', 'install'],
      hmr: false,
      watch: ['src'],
    },
  }))

  try {
    await assert.rejects(
      startDevelopmentSite({
        toolsDir: fixture.toolsDir,
        catalogDir: fixture.catalogDir,
        host: '127.0.0.1',
        port: 0,
        readinessTimeoutMs: 5000,
      }),
      (error) => error.message.includes('Broken sample utility') && error.message.includes('23') && error.message.includes('pnpm install'),
    )

    const childServer = JSON.parse(await readFile(fixture.markerPath, 'utf8'))
    await assert.rejects(fetch(`http://127.0.0.1:${childServer.port}${childServer.basePath}`))
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('reports an actionable error when the root development port is occupied', async () => {
  const fixture = await createFixture()
  const occupiedServer = net.createServer()

  try {
    await new Promise((resolve, reject) => {
      occupiedServer.once('error', reject)
      occupiedServer.listen(0, '127.0.0.1', resolve)
    })
    const { port } = occupiedServer.address()

    await assert.rejects(
      startDevelopmentSite({
        toolsDir: fixture.toolsDir,
        catalogDir: fixture.catalogDir,
        host: '127.0.0.1',
        port,
      }),
      (error) => error.message.includes(`Root development port ${port} is already in use`) && error.message.includes('TOOL_SET_DEV_PORT'),
    )
    await assert.rejects(readFile(fixture.markerPath))
  } finally {
    await new Promise((resolve) => occupiedServer.close(resolve))
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('waits for the directory page to respond before starting tools', async () => {
  const fixture = await createFixture()
  await rm(path.join(fixture.catalogDir, 'index.html'))

  try {
    await assert.rejects(
      startDevelopmentSite({
        toolsDir: fixture.toolsDir,
        catalogDir: fixture.catalogDir,
        host: '127.0.0.1',
        port: 0,
        readinessTimeoutMs: 500,
      }),
      (error) => error.message.includes('Directory page failed to start') && error.message.includes('HTTP 404'),
    )
    await assert.rejects(readFile(fixture.markerPath))
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})
