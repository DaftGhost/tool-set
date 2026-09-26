import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function serveToolDirectoryIndexes(): Plugin {
  return {
    name: 'serve-generated-tool-directory-indexes',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url?.startsWith('/tools/') && request.url.endsWith('/')) {
          request.url += 'index.html'
        }
        next()
      })
    },
  }
}

export default defineConfig({
  root: 'catalog',
  base: './',
  publicDir: '../site',
  plugins: [react(), serveToolDirectoryIndexes()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: false,
  },
})
