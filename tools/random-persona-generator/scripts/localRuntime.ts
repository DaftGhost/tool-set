import { fileURLToPath } from 'node:url'

export const persistencePath = fileURLToPath(new URL('../../../.wrangler/state', import.meta.url))

export function configureLocalRuntime() {
  process.env.WRANGLER_LOG_PATH ??= fileURLToPath(new URL('../../../.wrangler/logs', import.meta.url))
  process.env.MINIFLARE_REGISTRY_PATH ??= fileURLToPath(new URL('../../../.wrangler/registry', import.meta.url))
  process.env.WRANGLER_REGISTRY_PATH ??= process.env.MINIFLARE_REGISTRY_PATH
  process.env.WRANGLER_SEND_METRICS = 'false'
}
