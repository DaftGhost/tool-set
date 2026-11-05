import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export class PrPreview {
  static marker = '<!-- tool-set-pr-preview -->'

  static tagForPullRequest(pullRequestNumber) {
    return `pr-${pullRequestNumber}`
  }

  static stripAnsi(text) {
    return String(text).replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
  }

  static parseUploadLog(log) {
    const text = PrPreview.stripAnsi(log).replace(/\r/g, '')
    const versionIds = [...text.matchAll(/Worker Version ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)]
      .map((match) => match[1].toLowerCase())
    const previewUrls = [...text.matchAll(/Version Preview URL:\s*(https:\/\/\S+)/gi)]
      .map((match) => match[1].replace(/[),.;]+$/, ''))
    return {
      versionId: versionIds.at(-1) ?? null,
      previewUrl: previewUrls.at(-1) ?? null,
    }
  }

  static versionIdsFromBody(body) {
    return [...String(body).matchAll(/<!-- version-id: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) -->/gi)]
      .map((match) => match[1].toLowerCase())
  }

  static previewComment({ previewUrl, versionIds, commitSha, pullRequestNumber }) {
    const ids = []
    for (const versionId of versionIds) {
      const normalized = versionId.toLowerCase()
      if (!ids.includes(normalized)) ids.push(normalized)
    }
    const latest = ids.at(-1)
    const lines = [
      PrPreview.marker,
      `预览：${previewUrl}`,
      '',
      `该地址指向 Worker \`tool-set\` 的版本 \`${latest}\`（提交 \`${commitSha}\`，拉取请求 #${pullRequestNumber}）。`,
      '版本由 `wrangler versions upload` 上传，不接收生产流量。它使用同一个 Worker `tool-set` 和生产环境的 `PERSONAS_DB` 绑定。',
      '关闭或合并此拉取请求后，工作流会删除这里记录的预览版本。',
      '',
      ...ids.map((versionId) => `<!-- version-id: ${versionId} -->`),
    ]
    return `${lines.join('\n')}\n`
  }

  static removedComment({ pullRequestNumber, deletedVersionIds, retainedVersionIds }) {
    const lines = [
      PrPreview.marker,
      `拉取请求 #${pullRequestNumber} 的预览版本已删除，预览地址不再可用。生产部署未改动。`,
    ]
    if (deletedVersionIds.length > 0) {
      lines.push('', ...deletedVersionIds.map((versionId) => `已删除版本 \`${versionId}\`。`))
    }
    if (retainedVersionIds.length > 0) {
      lines.push(
        '',
        '以下版本仍保留。它们正在接收生产流量，或标签不属于这个拉取请求：',
        ...retainedVersionIds.map((versionId) => `- \`${versionId}\``),
      )
    }
    if (deletedVersionIds.length === 0 && retainedVersionIds.length === 0) {
      lines.push('', '这条评论里没有记录可删除的版本。')
    }
    return `${lines.join('\n')}\n`
  }

  static activeVersionIds(payload) {
    const deployments = payload?.result?.deployments ?? (Array.isArray(payload?.result) ? payload.result : [])
    const latest = deployments[0]
    return new Set((latest?.versions ?? []).map((version) => version.version_id?.toLowerCase()).filter(Boolean))
  }

  static partitionVersions(recordedIds, activeIds) {
    const deleteIds = []
    const retainedIds = []
    for (const versionId of recordedIds) {
      const normalized = versionId.toLowerCase()
      if (deleteIds.includes(normalized) || retainedIds.includes(normalized)) continue
      if (activeIds.has(normalized)) retainedIds.push(normalized)
      else deleteIds.push(normalized)
    }
    return { deleteIds, retainedIds }
  }

  static versionTag(version) {
    const annotations = version?.annotations ?? version?.metadata?.annotations ?? {}
    const tag = annotations['workers/tag'] ?? annotations.workers_tag
    return typeof tag === 'string' ? tag : null
  }

  static assertPreviewUrl(url) {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('wrangler versions upload did not report an absolute preview URL')
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.workers.dev')) {
      throw new Error('Preview URL must be an https workers.dev address')
    }
    return url
  }

  static required(env, name) {
    const value = env[name]
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing ${name}`)
    return value.trim()
  }

  static githubToken(env) {
    return env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim() || PrPreview.required(env, 'GH_TOKEN')
  }

  static repository(env) {
    const repository = PrPreview.required(env, 'GITHUB_REPOSITORY')
    if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY must be owner/name')
    return repository
  }

  static pullRequestNumber(env) {
    const value = PrPreview.required(env, 'PR_NUMBER')
    if (!/^[1-9]\d*$/.test(value)) throw new Error('PR_NUMBER must be a positive integer')
    return Number(value)
  }

  static commitSha(env) {
    const sha = PrPreview.required(env, 'HEAD_SHA')
    if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('HEAD_SHA must be a 40 character commit SHA')
    return sha
  }

  static async workerName(readFileImpl = readFile) {
    const raw = await readFileImpl(new URL('../wrangler.json', import.meta.url), 'utf8')
    const name = JSON.parse(raw).name
    if (typeof name !== 'string' || name.trim() === '') throw new Error('wrangler.json is missing a Worker name')
    return name
  }

  static async send(fetchImpl, url, { method, headers, body, failureLabel }) {
    const response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    let parsed = null
    if (text !== '') {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { message: text.slice(0, 300) }
      }
    }
    if (!response.ok || parsed?.success === false) {
      const detail = parsed?.message
        || parsed?.errors?.map((error) => error.message).filter(Boolean).join('; ')
        || response.statusText
      const error = new Error(`${failureLabel} failed (${response.status}): ${detail}`)
      error.status = response.status
      throw error
    }
    return parsed
  }

  static githubHeaders(token, hasBody) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'tool-set-pr-preview',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    }
  }

  static async github(env, fetchImpl, method, requestPath, body) {
    const token = PrPreview.githubToken(env)
    return PrPreview.send(fetchImpl, `https://api.github.com${requestPath}`, {
      method,
      headers: PrPreview.githubHeaders(token, body !== undefined),
      body,
      failureLabel: `GitHub ${method} ${requestPath}`,
    })
  }

  static async cloudflare(env, fetchImpl, method, requestPath) {
    const token = PrPreview.required(env, 'CLOUDFLARE_API_TOKEN')
    PrPreview.required(env, 'CLOUDFLARE_ACCOUNT_ID')
    return PrPreview.send(fetchImpl, `https://api.cloudflare.com/client/v4${requestPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      failureLabel: `Cloudflare ${method} ${requestPath.replace(/\/accounts\/[^/]+/, '/accounts/:account')}`,
    })
  }

  static repositoryPath(repository) {
    const [owner, repo] = repository.split('/')
    return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  }

  static async markerComments(env, fetchImpl, repository, pullRequestNumber) {
    const comments = []
    const base = `/repos/${PrPreview.repositoryPath(repository)}/issues/${pullRequestNumber}/comments`
    for (let page = 1; page <= 20; page += 1) {
      const batch = await PrPreview.github(env, fetchImpl, 'GET', `${base}?per_page=100&page=${page}`)
      if (!Array.isArray(batch) || batch.length === 0) break
      comments.push(...batch)
      if (batch.length < 100) break
    }
    return comments
      .filter((comment) => typeof comment?.body === 'string' && comment.body.includes(PrPreview.marker) && Number.isInteger(comment.id))
      .sort((left, right) => left.id - right.id)
  }

  static async upsertComment(env, fetchImpl, repository, commentId, body) {
    if (commentId) {
      await PrPreview.github(env, fetchImpl, 'PATCH', `/repos/${PrPreview.repositoryPath(repository)}/issues/comments/${commentId}`, { body })
      return
    }
    throw new Error('Missing comment id')
  }

  static async createComment(env, fetchImpl, repository, pullRequestNumber, body) {
    await PrPreview.github(env, fetchImpl, 'POST', `/repos/${PrPreview.repositoryPath(repository)}/issues/${pullRequestNumber}/comments`, { body })
  }

  static async previewUrlForVersion(env, fetchImpl, workerName, versionId) {
    const accountId = PrPreview.required(env, 'CLOUDFLARE_ACCOUNT_ID')
    const payload = await PrPreview.cloudflare(
      env,
      fetchImpl,
      'GET',
      `/accounts/${accountId}/workers/workers/${encodeURIComponent(workerName)}/versions/${versionId}`,
    )
    const urls = payload?.result?.urls
    const url = Array.isArray(urls) ? urls.find((candidate) => typeof candidate === 'string' && candidate.startsWith('https://')) : null
    if (!url) throw new Error(`Worker version ${versionId} did not include a preview URL`)
    return PrPreview.assertPreviewUrl(url)
  }

  static async publishComment(options = {}) {
    const env = options.env ?? process.env
    const fetchImpl = options.fetch ?? globalThis.fetch
    const readFileImpl = options.readFile ?? readFile
    const workerName = options.workerName ?? await PrPreview.workerName(readFileImpl)
    const repository = PrPreview.repository(env)
    const pullRequestNumber = PrPreview.pullRequestNumber(env)
    const commitSha = PrPreview.commitSha(env)
    const log = await readFileImpl(env.UPLOAD_LOG, 'utf8')
    const parsed = PrPreview.parseUploadLog(log)
    if (!parsed.versionId) throw new Error('wrangler versions upload did not report a Worker Version ID')
    const previewUrl = parsed.previewUrl
      ? PrPreview.assertPreviewUrl(parsed.previewUrl)
      : await PrPreview.previewUrlForVersion(env, fetchImpl, workerName, parsed.versionId)
    const comments = await PrPreview.markerComments(env, fetchImpl, repository, pullRequestNumber)
    const priorIds = comments.flatMap((comment) => PrPreview.versionIdsFromBody(comment.body))
      .filter((versionId) => versionId !== parsed.versionId)
    const body = PrPreview.previewComment({
      previewUrl,
      versionIds: [...priorIds, parsed.versionId],
      commitSha,
      pullRequestNumber,
    })
    const existing = comments[0]
    if (existing) await PrPreview.upsertComment(env, fetchImpl, repository, existing.id, body)
    else await PrPreview.createComment(env, fetchImpl, repository, pullRequestNumber, body)
    console.log(previewUrl)
    return previewUrl
  }

  static async deleteVersion(env, fetchImpl, workerName, versionId, pullRequestNumber) {
    const accountId = PrPreview.required(env, 'CLOUDFLARE_ACCOUNT_ID')
    const worker = encodeURIComponent(workerName)
    const readPath = `/accounts/${accountId}/workers/scripts/${worker}/versions/${versionId}`
    const deletePath = `/accounts/${accountId}/workers/workers/${worker}/versions/${versionId}`
    let payload
    try {
      payload = await PrPreview.cloudflare(env, fetchImpl, 'GET', readPath)
    } catch (error) {
      if (error.status === 404) return 'missing'
      throw error
    }
    const tag = PrPreview.versionTag(payload?.result ?? payload)
    if (tag == null) throw new Error(`Worker version ${versionId} did not include a tag; refusing to delete it`)
    if (tag !== PrPreview.tagForPullRequest(pullRequestNumber)) return 'retained'
    try {
      await PrPreview.cloudflare(env, fetchImpl, 'DELETE', deletePath)
    } catch (error) {
      if (error.status === 404) return 'missing'
      if (error.status === 409 || /deploy/i.test(error.message)) return 'retained'
      throw error
    }
    return 'deleted'
  }

  static async deletePreview(options = {}) {
    const env = options.env ?? process.env
    const fetchImpl = options.fetch ?? globalThis.fetch
    const workerName = options.workerName ?? await PrPreview.workerName()
    const repository = PrPreview.repository(env)
    const pullRequestNumber = PrPreview.pullRequestNumber(env)
    const comments = await PrPreview.markerComments(env, fetchImpl, repository, pullRequestNumber)
    const recordedIds = comments.flatMap((comment) => PrPreview.versionIdsFromBody(comment.body))
    const deletedVersionIds = []
    const retainedVersionIds = []
    if (recordedIds.length > 0) {
      const accountId = PrPreview.required(env, 'CLOUDFLARE_ACCOUNT_ID')
      const deployments = await PrPreview.cloudflare(
        env,
        fetchImpl,
        'GET',
        `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/deployments?per_page=1`,
      )
      const activeIds = PrPreview.activeVersionIds(deployments)
      const { deleteIds, retainedIds } = PrPreview.partitionVersions(recordedIds, activeIds)
      retainedVersionIds.push(...retainedIds)
      for (const versionId of deleteIds) {
        const outcome = await PrPreview.deleteVersion(env, fetchImpl, workerName, versionId, pullRequestNumber)
        if (outcome === 'deleted' || outcome === 'missing') deletedVersionIds.push(versionId)
        else retainedVersionIds.push(versionId)
      }
    }
    const body = PrPreview.removedComment({ pullRequestNumber, deletedVersionIds, retainedVersionIds })
    for (const comment of comments) {
      await PrPreview.upsertComment(env, fetchImpl, repository, comment.id, body)
    }
    return { deletedVersionIds, retainedVersionIds }
  }

  static async main(argv) {
    const command = argv[0]
    if (command === 'comment') {
      await PrPreview.publishComment()
      return
    }
    if (command === 'cleanup') {
      await PrPreview.deletePreview()
      return
    }
    throw new Error('Usage: node scripts/prPreview.mjs <comment|cleanup>')
  }
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  try {
    await PrPreview.main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
