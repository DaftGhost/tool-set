import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: process.env.TOOL_HMR_CLIENT_PORT
    ? { hmr: { clientPort: Number(process.env.TOOL_HMR_CLIENT_PORT) } }
    : undefined,
  build: {
    sourcemap: true,
  },
}))
