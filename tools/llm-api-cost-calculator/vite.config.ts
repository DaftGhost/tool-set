import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [vue()],
  server: process.env.TOOL_HMR_CLIENT_PORT
    ? { hmr: { clientPort: Number(process.env.TOOL_HMR_CLIENT_PORT) } }
    : undefined,
}))
