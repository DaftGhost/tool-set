/// <reference types="node" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [tailwindcss(), react()],
  server: {
    fs: { allow: ['.', '../..'] },
    ...(process.env.TOOL_HMR_CLIENT_PORT
      ? { hmr: { clientPort: Number(process.env.TOOL_HMR_CLIENT_PORT) } }
      : {}),
  },
  build: {
    sourcemap: true,
  },
}))
