import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'

const repositoryRoot = new URL('../', import.meta.url)

test('Workers configuration targets the assembled site and preserves directory indexes and 404s', async () => {
  const config = JSON.parse(await readFile(new URL('wrangler.json', repositoryRoot), 'utf8'))

  assert.equal(config.name, 'tool-set')
  assert.equal(config.assets.directory, './site')
  assert.equal(config.assets.html_handling, 'auto-trailing-slash')
  assert.equal(config.assets.not_found_handling, 'none')
  assert.equal(config.workers_dev, true)
})

test('the deployment command builds before uploading assets through Wrangler', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', repositoryRoot), 'utf8'))

  assert.equal(manifest.scripts.deploy, 'pnpm run build && wrangler deploy')
  assert.ok(manifest.devDependencies.wrangler)
})

test('the default deployment excludes local-only D1 identifiers', async () => {
  const config = JSON.parse(await readFile(new URL('wrangler.json', repositoryRoot), 'utf8'))
  for (const database of config.d1_databases ?? []) {
    assert.notEqual(database.database_id, '00000000-0000-0000-0000-000000000001')
  }
})

test('the repository has no GitHub workflows because Workers Builds owns validation and deployment', async () => {
  const directory = new URL('.github/workflows/', repositoryRoot)
  const files = await readdir(directory).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  assert.deepEqual(files, [])
})

test('the persona API runs before assets and unrelated routes retain their asset response', async () => {
  const config = JSON.parse(await readFile(new URL('wrangler.json', repositoryRoot), 'utf8'))
  assert.equal(config.main, 'worker/index.ts')
  assert.equal(config.assets.binding, 'ASSETS')
  assert.deepEqual(config.assets.run_worker_first, ['/tools/random-persona-generator/api/*'])
  assert.ok(config.env.local.d1_databases.some((binding) => binding.binding === 'PERSONAS_DB'))
  assert.equal(config.r2_buckets, undefined)

  const { default: worker } = await import('../worker/index.ts')
  const request = new Request('https://example.com/tools/llm-api-cost-calculator/')
  const env = {
    ASSETS: { fetch: async (incoming) => new Response(incoming.url, { status: 202 }) },
    PERSONAS_DB: { prepare: async () => { throw new Error('unrelated routes must not read persona storage') } },
  }
  const response = await worker.fetch(request, env)
  assert.equal(response.status, 202)
  assert.equal(await response.text(), request.url)
})

test('the deployed persona API reports an unconfigured database without calling assets', async (context) => {
  const config = JSON.parse(await readFile(new URL('wrangler.json', repositoryRoot), 'utf8'))
  const { default: worker } = await import('../worker/index.ts')
  const errors = context.mock.method(console, 'error', () => {})
  const response = await worker.fetch(new Request('https://example.com/tools/random-persona-generator/api/random'), {
    ...config.vars,
    ASSETS: { fetch: async () => { throw new Error('API requests must not fall through to assets') } },
  })
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { error: 'PERSONA_DATA_UNAVAILABLE' })
  assert.equal(JSON.parse(errors.mock.calls[0].arguments[0]).reason, 'Persona database is not configured')
})

test('local site previews use the same D1 identity and version as the tool development server', async () => {
  const config = JSON.parse(await readFile(new URL('wrangler.json', repositoryRoot), 'utf8'))
  const standalone = JSON.parse(await readFile(new URL('tools/random-persona-generator/wrangler.local.json', repositoryRoot), 'utf8'))
  const manifest = JSON.parse(await readFile(new URL('package.json', repositoryRoot), 'utf8'))
  assert.equal(config.env.local.d1_databases[0].database_id, standalone.d1_databases[0].database_id)
  assert.deepEqual(config.env.local.vars, standalone.vars)
  assert.match(manifest.scripts['preview:workers'], /wrangler dev --env local --local/)
})
