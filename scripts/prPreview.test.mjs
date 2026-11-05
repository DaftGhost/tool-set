import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PrPreview } from './prPreview.mjs'

const repositoryRoot = new URL('../', import.meta.url)
const previewVersionId = '51e4886e-2db7-4900-8d38-fbfecfeab993'
const olderVersionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const activeVersionId = '11111111-2222-4333-8444-555555555555'
const previewUrl = 'https://51e4886e-tool-set.example.workers.dev'
const commitSha = '0123456789abcdef0123456789abcdef01234567'

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    async text() {
      return JSON.stringify(body)
    },
  }
}

function env(overrides = {}) {
  return {
    GH_TOKEN: 'github-token',
    GITHUB_REPOSITORY: 'DaftGhost/tool-set',
    PR_NUMBER: '12',
    HEAD_SHA: commitSha,
    CLOUDFLARE_ACCOUNT_ID: 'account123',
    CLOUDFLARE_API_TOKEN: 'cloudflare-token',
    UPLOAD_LOG: 'upload.log',
    ...overrides,
  }
}

function uploadLog() {
  return [
    '\u001B[32mWorker Version ID:\u001B[0m 51e4886e-2db7-4900-8d38-fbfecfeab993',
    `Version Preview URL: ${previewUrl}`,
    'Version Preview Alias URL: https://pr-12-tool-set.example.workers.dev',
  ].join('\n')
}

test('upload logs yield the version URL and ignore the alias URL', () => {
  const parsed = PrPreview.parseUploadLog(uploadLog())
  assert.equal(parsed.versionId, previewVersionId)
  assert.equal(parsed.previewUrl, previewUrl)
})

test('preview comments keep every uploaded version id and update the same marker', () => {
  const body = PrPreview.previewComment({
    previewUrl,
    versionIds: [olderVersionId, previewVersionId, previewVersionId],
    commitSha,
    pullRequestNumber: 12,
  })
  assert.equal(body.startsWith(`${PrPreview.marker}\n`), true)
  assert.match(body, new RegExp(previewUrl))
  assert.deepEqual(PrPreview.versionIdsFromBody(body), [olderVersionId, previewVersionId])
  assert.match(body, /PERSONAS_DB/)
  assert.match(body, /tool-set/)
})

test('publishing a preview creates one sticky comment', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body })
    if (init.method === 'GET') return response(200, [])
    return response(201, { id: 9 })
  }
  const url = await PrPreview.publishComment({
    env: env(),
    fetch: fetchImpl,
    readFile: async () => uploadLog(),
    workerName: 'tool-set',
  })
  assert.equal(url, previewUrl)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].method, 'POST')
  assert.match(calls[1].url, /\/repos\/DaftGhost\/tool-set\/issues\/12\/comments$/)
  const body = JSON.parse(calls[1].body).body
  assert.equal(body.includes(PrPreview.marker), true)
  assert.deepEqual(PrPreview.versionIdsFromBody(body), [previewVersionId])
  assert.equal(calls.some((call) => call.url.includes('api.cloudflare.com')), false)
})

test('republishing updates the oldest sticky comment and keeps prior version ids', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body })
    if (init.method === 'GET') {
      return response(200, [{
        id: 4,
        body: `<!-- tool-set-pr-preview -->\n<!-- version-id: ${olderVersionId} -->\n`,
      }])
    }
    return response(200, { id: 4 })
  }
  await PrPreview.publishComment({
    env: env(),
    fetch: fetchImpl,
    readFile: async () => uploadLog(),
    workerName: 'tool-set',
  })
  assert.equal(calls[1].method, 'PATCH')
  assert.match(calls[1].url, /\/issues\/comments\/4$/)
  assert.deepEqual(PrPreview.versionIdsFromBody(JSON.parse(calls[1].body).body), [olderVersionId, previewVersionId])
})

test('closing a pull request deletes tagged preview versions and leaves the active deployment', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body })
    if (url.includes('/issues/12/comments?')) {
      return response(200, [{
        id: 4,
        body: [
          '<!-- tool-set-pr-preview -->',
          `<!-- version-id: ${previewVersionId} -->`,
          `<!-- version-id: ${activeVersionId} -->`,
          `<!-- version-id: ${olderVersionId} -->`,
        ].join('\n'),
      }])
    }
    if (url.includes('/deployments')) {
      return response(200, {
        success: true,
        result: { deployments: [{ versions: [{ version_id: activeVersionId, percentage: 100 }] }] },
      })
    }
    if (url.endsWith(`/versions/${previewVersionId}`) && init.method === 'GET') {
      return response(200, { success: true, result: { id: previewVersionId, annotations: { 'workers/tag': 'pr-12' } } })
    }
    if (url.endsWith(`/versions/${olderVersionId}`) && init.method === 'GET') {
      return response(200, { success: true, result: { id: olderVersionId, annotations: { 'workers/tag': 'pr-99' } } })
    }
    if (init.method === 'DELETE') return response(200, { success: true, errors: [], messages: [] })
    if (init.method === 'PATCH') return response(200, { id: 4 })
    return response(500, { message: `unexpected ${init.method} ${url}` })
  }
  const result = await PrPreview.deletePreview({
    env: env(),
    fetch: fetchImpl,
    workerName: 'tool-set',
  })
  assert.deepEqual(result.deletedVersionIds, [previewVersionId])
  assert.deepEqual(result.retainedVersionIds, [activeVersionId, olderVersionId])
  const deletedUrls = calls.filter((call) => call.method === 'DELETE').map((call) => call.url)
  assert.deepEqual(deletedUrls, [`https://api.cloudflare.com/client/v4/accounts/account123/workers/workers/tool-set/versions/${previewVersionId}`])
  const patched = JSON.parse(calls.find((call) => call.method === 'PATCH').body).body
  assert.equal(patched.includes('<!-- version-id:'), false)
  assert.match(patched, /生产部署未改动/)
})

test('closing a pull request without a preview comment does not call Cloudflare', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method })
    return response(200, [])
  }
  const result = await PrPreview.deletePreview({
    env: env(),
    fetch: fetchImpl,
    workerName: 'tool-set',
  })
  assert.deepEqual(result, { deletedVersionIds: [], retainedVersionIds: [] })
  assert.equal(calls.every((call) => call.url.startsWith('https://api.github.com/')), true)
})

test('the pull request workflow uploads a version and deletes it on close', async () => {
  const workflow = await readFile(new URL('.github/workflows/pr-preview.yml', repositoryRoot), 'utf8')
  const readme = await readFile(new URL('README.md', repositoryRoot), 'utf8')
  for (const event of ['opened', 'synchronize', 'reopened', 'closed']) {
    assert.match(workflow, new RegExp(`- ${event}`))
  }
  assert.match(workflow, /cancel-in-progress:\s*true/)
  assert.match(workflow, /contents:\s*read/)
  assert.match(workflow, /pull-requests:\s*write/)
  assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/)
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/)
  assert.match(workflow, /corepack pnpm install --frozen-lockfile/)
  assert.match(workflow, /corepack pnpm run build/)
  assert.match(workflow, /wrangler versions upload/)
  assert.match(workflow, /node scripts\/prPreview\.mjs comment/)
  assert.match(workflow, /node scripts\/prPreview\.mjs cleanup/)
  assert.equal(workflow.includes('wrangler deploy'), false)
  assert.equal(workflow.includes('wrangler versions deploy'), false)
  assert.equal(workflow.includes('wrangler preview'), false)
  assert.equal(workflow.includes('--env local'), false)
  assert.equal(workflow.includes('tool-set-preview'), false)
  assert.equal(readme.includes('仓库不保留 GitHub Actions 工作流'), false)
  assert.match(readme, /wrangler versions upload/)
  assert.match(readme, /CLOUDFLARE_ACCOUNT_ID/)
  assert.match(readme, /CLOUDFLARE_API_TOKEN/)
  assert.match(readme, /Preview builds/)
})
