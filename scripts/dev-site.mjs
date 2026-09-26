import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templateValues = new Set(['host', 'port', 'basePath', 'rootPort'])
const rootPackage = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
const rootDevServerConfig = rootPackage.toolSet?.devServer ?? {}

function isWithin(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function invalidMetadata(metadataPath, field, detail) {
  return new Error(`Invalid tool metadata at ${metadataPath}: ${field} ${detail}`)
}

function validateToolMetadata(metadata, slug, metadataPath, toolDir) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw invalidMetadata(metadataPath, 'directory name', 'must contain lowercase letters, numbers, and single hyphens')
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw invalidMetadata(metadataPath, 'root', 'must be a JSON object')
  }
  if (metadata.schemaVersion !== 1) throw invalidMetadata(metadataPath, 'schemaVersion', 'must be 1')
  if (metadata.kind !== 'browser') throw invalidMetadata(metadataPath, 'kind', 'must be "browser"')
  for (const field of ['category', 'actionLabel', 'name', 'summary']) {
    if (typeof metadata[field] !== 'string' || metadata[field].trim() === '') {
      throw invalidMetadata(metadataPath, field, 'must be a non-empty string')
    }
  }

  const dev = metadata.dev
  if (!dev || typeof dev !== 'object' || Array.isArray(dev)) {
    throw invalidMetadata(metadataPath, 'dev', 'must declare the tool development server')
  }
  if (!Array.isArray(dev.command) || dev.command.length === 0 || dev.command.some((part) => typeof part !== 'string') || dev.command[0].trim() === '') {
    throw invalidMetadata(metadataPath, 'dev.command', 'must be a non-empty array of command arguments')
  }
  if (typeof dev.hmr !== 'boolean') throw invalidMetadata(metadataPath, 'dev.hmr', 'must be true or false')
  if (dev.install !== undefined && (
    !Array.isArray(dev.install)
    || dev.install.length === 0
    || dev.install.some((part) => typeof part !== 'string')
    || dev.install[0].trim() === ''
  )) {
    throw invalidMetadata(metadataPath, 'dev.install', 'must be a non-empty array of command arguments')
  }
  if (dev.environment !== undefined && (!dev.environment || typeof dev.environment !== 'object' || Array.isArray(dev.environment))) {
    throw invalidMetadata(metadataPath, 'dev.environment', 'must be an object of environment variable values')
  }
  for (const [key, value] of Object.entries(dev.environment ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string') {
      throw invalidMetadata(metadataPath, `dev.environment.${key}`, 'must have a valid name and string value')
    }
  }
  if (dev.readinessPath !== undefined && (typeof dev.readinessPath !== 'string' || !dev.readinessPath.startsWith('/'))) {
    throw invalidMetadata(metadataPath, 'dev.readinessPath', 'must be an absolute URL path')
  }
  if (dev.watch !== undefined && (!Array.isArray(dev.watch) || dev.watch.some((item) => typeof item !== 'string' || item.trim() === ''))) {
    throw invalidMetadata(metadataPath, 'dev.watch', 'must be an array of relative file or directory paths')
  }
  if (!dev.hmr && (!Array.isArray(dev.watch) || dev.watch.length === 0)) {
    throw invalidMetadata(metadataPath, 'dev.watch', 'must list files to watch when HMR is disabled')
  }

  const watchPaths = (dev.watch ?? []).map((item) => {
    if (path.isAbsolute(item) || path.win32.isAbsolute(item)) {
      throw invalidMetadata(metadataPath, 'dev.watch', 'paths must be relative to the tool directory')
    }
    const resolved = path.resolve(toolDir, item)
    if (!isWithin(toolDir, resolved)) throw invalidMetadata(metadataPath, 'dev.watch', 'paths must not escape the tool directory')
    return resolved
  })

  for (const argument of [...dev.command, ...Object.values(dev.environment ?? {})]) {
    for (const [, token] of argument.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)) {
      if (!templateValues.has(token)) throw invalidMetadata(metadataPath, 'dev', `uses unknown template value {${token}}`)
    }
  }
  const declaredTemplates = [...dev.command, ...Object.values(dev.environment ?? {})].join('\n')
  const requiredTemplates = ['port', 'basePath', ...(dev.hmr ? ['rootPort'] : [])]
  for (const token of requiredTemplates) {
    if (!declaredTemplates.includes(`{${token}}`)) {
      throw invalidMetadata(metadataPath, 'dev.command or dev.environment', `must use {${token}}`)
    }
  }

  return {
    slug,
    toolDir,
    name: metadata.name,
    category: metadata.category,
    actionLabel: metadata.actionLabel,
    summary: metadata.summary,
    dev,
    watchPaths,
  }
}

async function readDevelopmentTools(toolsDir) {
  let entries
  try {
    entries = await readdir(toolsDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const tools = []
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const toolDir = path.join(toolsDir, entry.name)
    const metadataPath = path.join(toolDir, 'tool.json')
    let metadata
    try {
      metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
    } catch (error) {
      throw new Error(`Could not read tool metadata at ${metadataPath}: ${error.message}`, { cause: error })
    }
    tools.push(validateToolMetadata(metadata, entry.name, metadataPath, toolDir))
  }
  return tools
}

function replaceTemplate(value, values) {
  return value.replace(/\{(host|port|basePath|rootPort)\}/g, (_, key) => String(values[key]))
}

function commandFromTemplate(command, values) {
  return command.map((part) => replaceTemplate(part, values))
}

async function findAvailablePort(host) {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

function sleep(ms, signal) {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}

function createReloadPlugin(tools, publicTools) {
  const fallbackTools = tools.filter((tool) => !tool.dev.hmr)
  const clients = new Map(fallbackTools.map((tool) => [tool.slug, new Set()]))
  const reloadScript = `const tool = new URL(document.currentScript.src).searchParams.get('tool');
if (tool) {
  const source = new EventSource('/__tool_reload/events?tool=' + encodeURIComponent(tool));
  source.addEventListener('reload', () => location.reload());
}\n`

  return {
    name: 'tool-set-development-runtime',
    configureServer(server) {
      const watchedPaths = fallbackTools.flatMap((tool) => tool.watchPaths)
      if (watchedPaths.length) server.watcher.add(watchedPaths)

      server.middlewares.use((request, response, next) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost')
        if (request.method === 'GET' && requestUrl.pathname === '/tools.json') {
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          response.end(`${JSON.stringify({ schemaVersion: 1, tools: publicTools }, null, 2)}\n`)
          return
        }
        if (request.method === 'GET' && requestUrl.pathname === '/__tool_reload.js') {
          response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
          response.end(reloadScript)
          return
        }
        if (request.method === 'GET' && requestUrl.pathname === '/__tool_reload/events') {
          const slug = requestUrl.searchParams.get('tool')
          const subscribers = clients.get(slug)
          if (!subscribers) {
            response.writeHead(404)
            response.end('Unknown tool')
            return
          }
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          })
          response.write('retry: 2000\n\n')
          subscribers.add(response)
          request.on('close', () => subscribers.delete(response))
          return
        }
        next()
      })

      server.watcher.on('all', (_event, changedPath) => {
        const absolutePath = path.resolve(changedPath)
        for (const tool of fallbackTools) {
          if (!tool.watchPaths.some((watchPath) => isWithin(watchPath, absolutePath))) continue
          for (const response of clients.get(tool.slug)) response.write('event: reload\ndata: {}\n\n')
        }
      })
    },
  }
}

function createProxyOptions(tool) {
  const options = {
    target: `http://127.0.0.1:${tool.port}`,
    changeOrigin: true,
    ws: tool.dev.hmr,
  }
  if (tool.dev.hmr) return options

  options.selfHandleResponse = true
  options.configure = (proxy) => {
    proxy.on('proxyReq', (proxyRequest) => proxyRequest.setHeader('accept-encoding', 'identity'))
    proxy.on('proxyRes', (proxyResponse, _request, response) => {
      const chunks = []
      proxyResponse.on('data', (chunk) => chunks.push(chunk))
      proxyResponse.on('end', () => {
        const contentType = String(proxyResponse.headers['content-type'] ?? '')
        let body = Buffer.concat(chunks)
        if (contentType.includes('text/html') && proxyResponse.statusCode >= 200 && proxyResponse.statusCode < 300) {
          const scriptTag = `<script src="/__tool_reload.js?tool=${encodeURIComponent(tool.slug)}"></script>`
          const html = body.toString('utf8')
          body = Buffer.from(/<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${scriptTag}</body>`) : `${html}${scriptTag}`)
        }
        const headers = { ...proxyResponse.headers }
        delete headers['content-length']
        delete headers['transfer-encoding']
        delete headers.etag
        delete headers['content-md5']
        response.writeHead(proxyResponse.statusCode ?? 200, headers)
        response.end(body)
      })
    })
  }
  return options
}

function collectOutput(stream, tool, target) {
  let pending = ''
  stream.on('data', (chunk) => {
    const text = chunk.toString()
    target.value = `${target.value}${text}`.slice(-8000)
    pending += text
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) console[stream === tool.child.stderr ? 'error' : 'log'](`[${tool.name}] ${line}`)
  })
  stream.on('end', () => {
    if (pending) console[stream === tool.child.stderr ? 'error' : 'log'](`[${tool.name}] ${pending}`)
  })
}

function spawnTool(tool, rootPort) {
  const values = {
    host: '127.0.0.1',
    port: tool.port,
    basePath: `/tools/${tool.slug}/`,
    rootPort,
  }
  const [executable, ...arguments_] = commandFromTemplate(tool.dev.command, values)
  const environment = Object.fromEntries(Object.entries(tool.dev.environment ?? {}).map(([key, value]) => [key, replaceTemplate(value, values)]))
  const stdout = { value: '' }
  const stderr = { value: '' }
  const child = spawn(executable, arguments_, {
    cwd: tool.toolDir,
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  tool.child = child
  tool.output = { stdout, stderr }
  child.once('error', (error) => { tool.spawnError = error })
  child.once('close', (code, signal) => { tool.closeInfo = { code, signal } })
  collectOutput(child.stdout, tool, stdout)
  collectOutput(child.stderr, tool, stderr)
  return child
}

function formatToolFailure(tool, reason) {
  const output = `${tool.output?.stderr.value ?? ''}${tool.output?.stdout.value ?? ''}`.trim()
  const diagnostics = `${reason}\n${output}`
  const nextStep = /EADDRINUSE|port\s+\d+\s+(?:is\s+)?already in use/i.test(diagnostics)
    ? ` The assigned tool port ${tool.port} is unavailable; restart pnpm dev to allocate another port.`
    : tool.dev.install?.length
      ? ` Install dependencies with: ${tool.dev.install.join(' ')} (run it in ${tool.toolDir}).`
      : ` Follow the dependency installation steps in ${path.join(tool.toolDir, 'README.md')} and retry.`
  return new Error(`Tool "${tool.name}" failed to start: ${reason}.${output ? ` Output: ${output}` : ''}${nextStep}`, { cause: tool.spawnError })
}

async function waitForTool(tool, signal, readinessTimeoutMs) {
  const readinessUrl = `http://127.0.0.1:${tool.port}${tool.dev.readinessPath ?? `/tools/${tool.slug}/`}`
  const deadline = Date.now() + readinessTimeoutMs
  let lastError = 'the readiness URL did not return a successful response'

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Development server startup cancelled')
    if (tool.spawnError) throw formatToolFailure(tool, tool.spawnError.message)
    if (tool.closeInfo) throw formatToolFailure(tool, `process exited with ${tool.closeInfo.code ?? tool.closeInfo.signal}`)
    try {
      const response = await fetch(readinessUrl, { signal: AbortSignal.timeout(750) })
      const ready = response.ok
      await response.body?.cancel().catch(() => {})
      if (ready) return
      lastError = `readiness check returned HTTP ${response.status}`
    } catch (error) {
      lastError = error.message
    }
    await sleep(100, signal)
  }
  throw formatToolFailure(tool, `timed out waiting for ${readinessUrl}: ${lastError}`)
}

async function waitForDirectoryPage(url, signal, readinessTimeoutMs) {
  const deadline = Date.now() + readinessTimeoutMs
  let lastError = 'the directory page did not return a successful response'
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Development server startup cancelled')
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(750) })
      const ready = response.ok
      await response.body?.cancel().catch(() => {})
      if (ready) return
      lastError = `readiness check returned HTTP ${response.status}`
    } catch (error) {
      lastError = error.message
    }
    await sleep(100, signal)
  }
  throw new Error(`Directory page failed to start at ${url}: ${lastError}`)
}

async function stopChild(child, timeoutMs = 3000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const closed = new Promise((resolve) => child.once('close', resolve))
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      await new Promise((resolve) => killer.once('close', resolve))
    } else {
      process.kill(-child.pid, 'SIGTERM')
    }
  } catch (error) {
    if (error.code !== 'ESRCH') child.kill('SIGTERM')
  }
  let timer
  const didClose = await Promise.race([closed.then(() => true), new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs) })])
  clearTimeout(timer)
  if (didClose) return
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
    else child.kill('SIGKILL')
  } catch (error) {
    if (error.code !== 'ESRCH') child.kill('SIGKILL')
  }
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
}

export async function startDevelopmentSite({
  toolsDir = path.join(repositoryRoot, 'tools'),
  catalogDir = path.join(repositoryRoot, 'catalog'),
  host = rootDevServerConfig.host ?? '127.0.0.1',
  port = rootDevServerConfig.port ?? 0,
  readinessTimeoutMs = 15000,
  signal,
} = {}) {
  const tools = await readDevelopmentTools(path.resolve(toolsDir))
  const requestedPort = Number(port)
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new Error(`Root development port must be an integer from 0 to 65535. Set TOOL_SET_DEV_PORT to a valid port. Received: ${port}`)
  }
  const rootPort = requestedPort || await findAvailablePort(host)
  const allocatedPorts = new Set([rootPort])
  for (const tool of tools) {
    do {
      tool.port = await findAvailablePort('127.0.0.1')
    } while (allocatedPorts.has(tool.port))
    allocatedPorts.add(tool.port)
  }

  let vite
  try {
    vite = await import('vite')
  } catch (error) {
    throw new Error(`Root development dependency "vite" is unavailable. Run corepack pnpm install in ${repositoryRoot} and try again. ${error.message}`, { cause: error })
  }

  let server
  let closePromise
  const close = () => {
    if (closePromise) return closePromise
    closePromise = (async () => {
      await Promise.allSettled(tools.map((tool) => stopChild(tool.child)))
      await server?.close()
    })()
    return closePromise
  }

  try {
    const proxies = Object.fromEntries(tools.map((tool) => [`/tools/${tool.slug}`, createProxyOptions(tool)]))
    const publicTools = tools.map(({ slug, category, actionLabel, name, summary }) => ({
      slug,
      category,
      actionLabel,
      name,
      summary,
      href: `./tools/${slug}/`,
    }))
    const devServer = await vite.createServer({
      configFile: false,
      root: path.resolve(catalogDir),
      appType: 'spa',
      plugins: [createReloadPlugin(tools, publicTools)],
      server: {
        host,
        port: rootPort,
        strictPort: true,
        proxy: proxies,
      },
    })
    server = devServer
    await server.listen()
    if (signal?.aborted) throw new Error('Development server startup cancelled')
    const address = server.httpServer.address()
    const actualPort = typeof address === 'object' && address ? address.port : rootPort
    const urlHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host
    const formattedHost = urlHost.includes(':') ? `[${urlHost}]` : urlHost
    const url = `http://${formattedHost}:${actualPort}/`
    const probeHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host
    const formattedProbeHost = probeHost.includes(':') ? `[${probeHost}]` : probeHost
    await waitForDirectoryPage(`http://${formattedProbeHost}:${actualPort}/`, signal, readinessTimeoutMs)
    for (const tool of tools) spawnTool(tool, actualPort)
    await Promise.all(tools.map((tool) => waitForTool(tool, signal, readinessTimeoutMs)))
    if (signal?.aborted) throw new Error('Development server startup cancelled')
    return { url, port: actualPort, close }
  } catch (error) {
    await close()
    if (error.message === 'Development server startup cancelled') throw error
    if (error.code === 'EADDRINUSE' || /(?:address|port .*?) already in use/i.test(error.message)) {
      throw new Error(`Root development port ${rootPort} is already in use. Choose another port with TOOL_SET_DEV_PORT=<port> pnpm dev. ${error.message}`, { cause: error })
    }
    throw error
  }
}

async function runDevelopmentServer() {
  const abortController = new AbortController()
  let site
  let resolveStopped
  const stopped = new Promise((resolve) => { resolveStopped = resolve })
  const onSignal = () => {
    abortController.abort()
    process.exitCode = 130
    void site?.close().finally(resolveStopped)
    resolveStopped()
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  try {
    site = await startDevelopmentSite({
      host: process.env.TOOL_SET_DEV_HOST || rootDevServerConfig.host || '127.0.0.1',
      port: process.env.TOOL_SET_DEV_PORT === undefined ? rootDevServerConfig.port ?? 0 : Number(process.env.TOOL_SET_DEV_PORT),
      signal: abortController.signal,
    })
    if (abortController.signal.aborted) return
    console.log(`Development site ready: ${site.url}`)
    console.log('Press Ctrl+C to stop the directory page and all registered tools.')
    await stopped
  } catch (error) {
    if (!abortController.signal.aborted) {
      console.error(error.message)
      process.exitCode = 1
    }
  } finally {
    await site?.close()
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDevelopmentServer()
}
