import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const siteRoot = path.join(projectRoot, 'site')
const port = 9527
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
])

function isWithin(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  response.end(message)
}

async function resolveSiteFile(pathname, realSiteRoot) {
  let filePath = path.resolve(siteRoot, `.${pathname}`)
  if (!isWithin(siteRoot, filePath)) return { status: 403 }

  let fileInfo = await stat(filePath)
  if (fileInfo.isDirectory()) {
    filePath = path.join(filePath, 'index.html')
    fileInfo = await stat(filePath)
  }
  if (!fileInfo.isFile()) return { status: 404 }

  const realFilePath = await realpath(filePath)
  if (!isWithin(realSiteRoot, realFilePath)) return { status: 403 }
  return { filePath: realFilePath, fileInfo }
}

let realSiteRoot
try {
  realSiteRoot = await realpath(siteRoot)
  const entryInfo = await stat(path.join(realSiteRoot, 'index.html'))
  if (!entryInfo.isFile()) throw new Error('site/index.html is not a file')
} catch {
  console.error('Built site not found. Run "pnpm run build" before starting the local server.')
  process.exitCode = 1
}

if (realSiteRoot) {
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('allow', 'GET, HEAD')
      sendText(response, 405, 'Method Not Allowed')
      return
    }

    let pathname
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    } catch {
      sendText(response, 400, 'Bad Request')
      return
    }

    try {
      const result = await resolveSiteFile(pathname, realSiteRoot)
      if (result.status === 403) {
        sendText(response, 403, 'Forbidden')
        return
      }
      if (result.status === 404) {
        sendText(response, 404, 'Not Found')
        return
      }

      response.writeHead(200, {
        'content-length': result.fileInfo.size,
        'content-type': contentTypes.get(path.extname(result.filePath).toLowerCase()) ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
      })
      if (request.method === 'HEAD') {
        response.end()
        return
      }

      createReadStream(result.filePath).on('error', (error) => {
        console.error(`Failed to read ${result.filePath}: ${error.message}`)
        if (response.headersSent) response.destroy(error)
        else sendText(response, 500, 'Internal Server Error')
      }).pipe(response)
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        sendText(response, 404, 'Not Found')
        return
      }
      console.error(`Failed to serve ${pathname}: ${error.message}`)
      sendText(response, 500, 'Internal Server Error')
    }
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`Serving ${siteRoot} at http://localhost:${port}/`)
  })
}
