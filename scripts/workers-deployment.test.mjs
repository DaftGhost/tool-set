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

test('GitHub workflows validate the site without publishing to Pages', async () => {
  const directory = new URL('.github/workflows/', repositoryRoot)
  const files = await readdir(directory)
  assert.ok(files.length > 0)

  for (const file of files) {
    const workflow = await readFile(new URL(file, directory), 'utf8')
    assert.doesNotMatch(workflow, /github-pages|actions\/(?:configure-pages|upload-pages-artifact|deploy-pages)@|pages: write/)
  }
})
