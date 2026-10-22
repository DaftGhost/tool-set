import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const templateValues = new Set(['host', 'port', 'basePath', 'rootPort'])

export function isWithin(parent, child) {
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

export async function readDevelopmentTools(toolsDir) {
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
