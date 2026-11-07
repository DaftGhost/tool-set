import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const repositoryRoot = new URL('../', import.meta.url)

class PreviewWorkflow {
  static between(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker)
    if (start < 0) throw new Error(`Missing preview workflow marker: ${JSON.stringify(startMarker)}`)
    const from = start + startMarker.length
    const end = source.indexOf(endMarker, from)
    if (end < 0) throw new Error(`Missing preview workflow marker: ${JSON.stringify(endMarker)}`)
    return source.slice(start, end)
  }

  static previewJob(workflow) {
    return PreviewWorkflow.between(workflow, '  preview:\n', '\n  cleanup:\n')
  }

  static step(workflow, stepName) {
    return PreviewWorkflow.between(workflow, `      - name: ${stepName}\n`, '\n      - name:')
  }

  static runScript(step) {
    const marker = 'run: |\n'
    const start = step.indexOf(marker)
    if (start < 0) throw new Error('Missing preview workflow run script')
    return step.slice(start + marker.length)
  }

  static envFlags(script) {
    return script.match(/--env(?:=|\s+)\S+/g) ?? []
  }
}

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

test('the default deployment binds a real persona D1 and excludes local-only identifiers', async () => {
  const config = JSON.parse(await readFile(new URL('wrangler.json', repositoryRoot), 'utf8'))
  assert.equal(config.d1_databases.length, 1)
  assert.equal(config.d1_databases[0].binding, 'PERSONAS_DB')
  for (const database of config.d1_databases ?? []) {
    assert.match(database.database_id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
    assert.notEqual(database.database_id, '00000000-0000-0000-0000-000000000001')
  }
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

test('pull request preview builds the site and uploads the top-level tool-set Worker version', async () => {
  const workflow = await readFile(new URL('.github/workflows/pr-preview.yml', repositoryRoot), 'utf8')
  const config = JSON.parse(await readFile(new URL('wrangler.json', repositoryRoot), 'utf8'))
  const preview = PreviewWorkflow.previewJob(workflow)
  const uploadStep = PreviewWorkflow.step(preview, 'Upload Worker version')
  const upload = PreviewWorkflow.runScript(uploadStep)
  const cleanupStep = PreviewWorkflow.step(workflow, 'Delete uploaded Worker versions')
  const cleanup = PreviewWorkflow.runScript(cleanupStep)

  assert.match(preview, / {6}- name: Build\n {8}run: pnpm run build\n[\s\S]*pnpm exec wrangler versions upload/)
  assert.equal(config.name, 'tool-set')
  assert.match(cleanupStep, /WORKER_NAME:\s*tool-set\s*(?:\n|$)/)
  assert.match(upload, /pnpm exec wrangler versions upload \\/)
  assert.deepEqual(PreviewWorkflow.envFlags(upload), ['--env=""'])
  assert.doesNotMatch(uploadStep, /env\.local/)
  assert.doesNotMatch(uploadStep, /CLOUDFLARE_ENV/)
  assert.doesNotMatch(upload, /--name\b/)
  assert.doesNotMatch(upload, /--config\b/)
  assert.doesNotMatch(workflow, /wrangler deploy\b/)

  assert.match(cleanup, /https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/\$\{CLOUDFLARE_ACCOUNT_ID\}/)
  assert.match(cleanup, /"\$\{api\}\/workers\/scripts\/\$\{WORKER_NAME\}\/deployments"/)
  assert.match(cleanup, /"\$\{api\}\/workers\/scripts\/\$\{WORKER_NAME\}\/versions\?page=\$\{page\}&per_page=50"/)
  assert.match(cleanup, /-X DELETE[\s\S]*"\$\{api\}\/workers\/workers\/\$\{WORKER_NAME\}\/versions\/\$\{id\}"/)
  assert.doesNotMatch(cleanup, /workers\/scripts\/\$\{WORKER_NAME\}\/versions\/\$\{id\}/)
})

test('cleanup waits for Workers Builds success on the merge commit before deleting preview versions', async () => {
  const workflow = await readFile(new URL('.github/workflows/pr-preview.yml', repositoryRoot), 'utf8')
  const preview = PreviewWorkflow.previewJob(workflow)
  const cleanupJob = workflow.slice(workflow.indexOf('\n  cleanup:\n'))
  const waitStep = PreviewWorkflow.step(cleanupJob, 'Wait for Workers Builds')
  const wait = PreviewWorkflow.runScript(waitStep)
  const cleanupStep = PreviewWorkflow.step(cleanupJob, 'Delete uploaded Worker versions')
  const cleanup = PreviewWorkflow.runScript(cleanupStep)
  const commentStep = cleanupJob.slice(cleanupJob.indexOf('      - name: Mark the preview comment deleted\n'))

  assert.match(workflow, /\n {2}checks: read\n/)
  assert.doesNotMatch(preview, /Wait for Workers Builds/)
  assert.ok(cleanupJob.indexOf('      - name: Wait for Workers Builds\n') < cleanupJob.indexOf('      - name: Delete uploaded Worker versions\n'))
  assert.match(waitStep, /if: github\.event\.pull_request\.merged == true\n/)
  assert.match(waitStep, /MERGE_COMMIT_SHA: \$\{\{ github\.event\.pull_request\.merge_commit_sha \}\}\n/)
  assert.match(waitStep, /GH_TOKEN: \$\{\{ github\.token \}\}\n/)
  assert.doesNotMatch(waitStep, /pull_request\.base\.sha/)
  assert.doesNotMatch(waitStep, /pull_request\.head\.sha/)
  assert.doesNotMatch(wait, /github\.sha/)

  assert.match(wait, /check_name="Workers Builds: tool-set"/)
  assert.match(wait, /workers_builds_timeout_seconds=480/)
  assert.match(wait, /check-runs\?check_name=\$\{query\}&filter=all&per_page=100/)
  assert.match(wait, /sort_by\(\.started_at \/\//)
  assert.match(wait, /Timed out waiting for \$\{check_name\} to succeed on \$\{MERGE_COMMIT_SHA\}\./)
  assert.match(wait, /concluded \$\{conclusion\}\. Refusing to delete preview versions\./)
  assert.equal(wait.indexOf('conclusion="pending"') < wait.indexOf('[[ "${conclusion}" == "success" ]]'), true)
  assert.doesNotMatch(wait, /exit 0/)

  assert.match(cleanup, /\|\| "\$\{status\}" == "404" \]\]/)
  assert.doesNotMatch(cleanup, /10339/)
  assert.doesNotMatch(cleanup, /\b409\b/)
  assert.doesNotMatch(cleanupStep, /continue-on-error/)
  assert.doesNotMatch(waitStep, /continue-on-error/)
  assert.doesNotMatch(commentStep, /always\(\)/)
  assert.doesNotMatch(commentStep, /continue-on-error/)
})

test('persona dataset version matches the data contract in every Wrangler var', async () => {
  const { datasetVersion } = await import('../tools/random-persona-generator/src/dataContract.ts')
  const config = JSON.parse(await readFile(new URL('wrangler.json', repositoryRoot), 'utf8'))
  const standalone = JSON.parse(await readFile(new URL('tools/random-persona-generator/wrangler.local.json', repositoryRoot), 'utf8'))

  assert.equal(typeof datasetVersion, 'string')
  assert.ok(datasetVersion)
  assert.equal(config.vars.PERSONA_DATASET_VERSION, datasetVersion)
  assert.equal(config.env.local.vars.PERSONA_DATASET_VERSION, datasetVersion)
  assert.equal(standalone.vars.PERSONA_DATASET_VERSION, datasetVersion)
})
