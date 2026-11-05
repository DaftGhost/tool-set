import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const hmrClientPort = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.TOOL_HMR_CLIENT_PORT

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [tailwindcss(), react()],
  server: hmrClientPort
    ? { hmr: { clientPort: Number(hmrClientPort) } }
    : undefined,
}))
