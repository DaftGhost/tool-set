import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer as createNetServer } from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { apiPath } from '../src/dataContract.ts'
import { configureLocalRuntime, persistencePath } from './localRuntime.ts'

const { values } = parseArgs({ options: {
  host: { type: 'string', default: '127.0.0.1' },
  port: { type: 'string', default: '5173' },
  base: { type: 'string', default: '/tools/random-persona-generator/' },
  strictPort: { type: 'boolean', default: true },
} })
const port = Number(values.port)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid development port')

async function availablePort() {
  const server = createNetServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Cannot allocate Worker port')
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return address.port
}

configureLocalRuntime()
const workerPort = await availablePort()
const workerOrigin = `http://127.0.0.1:${workerPort}`
const require = createRequire(import.meta.url)
const cli = path.join(path.dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js')
const worker = spawn(process.execPath, [cli, 'dev', '--config', 'wrangler.local.json', '--local', '--ip', '127.0.0.1', '--port', String(workerPort), '--persist-to', persistencePath, '--show-interactive-dev-session=false'], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env })
let startupError: Error | undefined
worker.on('error', error => { startupError = error })
const workerExit = new Promise<void>(resolve => worker.once('exit', () => resolve()))
let frontend: ViteDevServer | undefined
let stopping = false

async function stop(code: number) {
  if (stopping) return
  stopping = true
  await frontend?.close()
  if (worker.exitCode === null && worker.signalCode === null) {
    worker.kill('SIGTERM')
    await Promise.race([workerExit, delay(5000)])
    if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGKILL')
  }
  process.exitCode = code
}
process.once('SIGINT', () => { void stop(0) })
process.once('SIGTERM', () => { void stop(0) })
worker.once('exit', code => {
  if (!stopping && frontend) {
    console.error(`Local Worker exited (${code ?? 'signal'})`)
    void stop(1)
  }
})

try {
  const deadline = Date.now() + 30000
  while (true) {
    if (stopping) break
    if (startupError) throw startupError
    if (worker.exitCode !== null || worker.signalCode !== null) throw new Error('Local Worker failed to start')
    try {
      const response = await fetch(workerOrigin, { signal: AbortSignal.timeout(500) })
      if (response.status === 404) break
    } catch { /* Retry until the local Worker is listening. */ }
    if (Date.now() > deadline) throw new Error('Local Worker startup timed out')
    await delay(100)
  }
  if (!stopping) {
    frontend = await createServer({ base: values.base, server: {
      host: values.host, port, strictPort: values.strictPort,
      proxy: { [apiPath]: { target: workerOrigin, changeOrigin: true } },
    } })
    if (stopping) await frontend.close()
    else {
      if (worker.exitCode !== null || worker.signalCode !== null) throw new Error('Local Worker exited during startup')
      await frontend.listen()
      frontend.printUrls()
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  await stop(1)
}
