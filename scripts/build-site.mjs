import { spawn } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(command, cwd) {
  return new Promise((resolve, reject) => {
    const [executable, ...args] = command
    const child = spawn(executable, args, { cwd, stdio: 'inherit' })

    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Command failed with exit code ${code}: ${command.join(' ')}`))
    })
  })
}

async function runToolCommand(command, toolDir, slug, field) {
  try {
    await run(command, toolDir)
  } catch (error) {
    throw new Error(`Tool ${slug} ${field} failed in ${toolDir}: ${error.message}`, { cause: error })
  }
}

function invalidMetadata(metadataPath, field, detail) {
  return new Error(`Invalid tool metadata at ${metadataPath}: ${field} ${detail}`)
}

function validateMetadata(metadata, slug, metadataPath, toolDir) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw invalidMetadata(metadataPath, 'directory name', 'must contain lowercase letters, numbers, and single hyphens')
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw invalidMetadata(metadataPath, 'root', 'must be a JSON object')
  }
  if (metadata.schemaVersion !== 1) {
    throw invalidMetadata(metadataPath, 'schemaVersion', 'must be 1')
  }
  if (metadata.kind !== 'browser') {
    throw invalidMetadata(metadataPath, 'kind', 'must be "browser"')
  }
  for (const field of ['category', 'actionLabel', 'name', 'summary']) {
    if (typeof metadata[field] !== 'string' || metadata[field].trim() === '') {
      throw invalidMetadata(metadataPath, field, 'must be a non-empty string')
    }
  }

  const build = metadata.build
  if (!build || typeof build !== 'object' || Array.isArray(build)) {
    throw invalidMetadata(metadataPath, 'build', 'must be an object')
  }
  if (build.install !== undefined && (
    !Array.isArray(build.install)
    || build.install.some((part) => typeof part !== 'string')
    || (build.install.length > 0 && build.install[0].trim() === '')
  )) {
    throw invalidMetadata(metadataPath, 'build.install', 'must be an array of command arguments')
  }
  if (!Array.isArray(build.command) || build.command.length === 0 || build.command.some((part) => typeof part !== 'string') || build.command[0].trim() === '') {
    throw invalidMetadata(metadataPath, 'build.command', 'must be a non-empty array of command arguments')
  }
  if (typeof build.outputDirectory !== 'string' || build.outputDirectory.trim() === '') {
    throw invalidMetadata(metadataPath, 'build.outputDirectory', 'must be a non-empty relative path')
  }
  if (path.isAbsolute(build.outputDirectory) || path.win32.isAbsolute(build.outputDirectory)) {
    throw invalidMetadata(metadataPath, 'build.outputDirectory', 'must be a relative path')
  }

  const resolvedOutputDirectory = path.resolve(toolDir, build.outputDirectory)
  const outputPathFromTool = path.relative(toolDir, resolvedOutputDirectory)
  if (outputPathFromTool === '..' || outputPathFromTool.startsWith(`..${path.sep}`) || path.isAbsolute(outputPathFromTool)) {
    throw invalidMetadata(metadataPath, 'build.outputDirectory', 'must not escape the tool directory')
  }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function pathsOverlap(first, second) {
  return isWithin(first, second) || isWithin(second, first)
}

async function validatePublishedToolOutputs(outputDir, expectedSlugs) {
  const toolsOutputDir = path.join(outputDir, 'tools')
  let entries = []
  try {
    entries = await readdir(toolsOutputDir, { withFileTypes: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const expected = new Set(expectedSlugs)
  const unexpected = entries
    .filter((entry) => !entry.isDirectory() || !expected.has(entry.name))
    .map((entry) => entry.name)
  const published = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
  const missing = expectedSlugs.filter((slug) => !published.has(slug))

  if (unexpected.length || missing.length) {
    const details = []
    if (unexpected.length) details.push(`unregistered outputs: ${unexpected.join(', ')}`)
    if (missing.length) details.push(`missing outputs: ${missing.join(', ')}`)
    throw new Error(`Site tool outputs at ${toolsOutputDir} do not match registered metadata: ${details.join('; ')}`)
  }

  for (const slug of expectedSlugs) {
    const indexPath = path.join(toolsOutputDir, slug, 'index.html')
    try {
      const index = await stat(indexPath)
      if (!index.isFile()) throw new Error('index.html is not a file')
    } catch (error) {
      throw new Error(`Registered tool ${slug} output at ${indexPath} is incomplete: ${error.message}`, { cause: error })
    }
  }
}

export async function buildSite({
  toolsDir = path.join(repositoryRoot, 'tools'),
  catalogDir = path.join(repositoryRoot, 'catalog', 'dist'),
  outputDir = path.join(repositoryRoot, 'site'),
} = {}) {
  const resolvedToolsDir = path.resolve(toolsDir)
  const resolvedCatalogDir = path.resolve(catalogDir)
  const resolvedOutputDir = path.resolve(outputDir)

  for (const [sourceName, sourceDir] of [['tools', resolvedToolsDir], ['catalog', resolvedCatalogDir]]) {
    if (pathsOverlap(resolvedOutputDir, sourceDir)) {
      throw new Error(`Output directory ${resolvedOutputDir} must not overlap the ${sourceName} source directory ${sourceDir}`)
    }
  }

  await rm(resolvedOutputDir, { recursive: true, force: true })
  await mkdir(resolvedOutputDir, { recursive: true })
  await cp(resolvedCatalogDir, resolvedOutputDir, { recursive: true })

  const entries = await readdir(resolvedToolsDir, { withFileTypes: true })
  const toolDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const tools = []

  for (const slug of toolDirectories) {
    const toolDir = path.join(resolvedToolsDir, slug)
    const metadataPath = path.join(toolDir, 'tool.json')
    let metadata
    try {
      metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
    } catch (error) {
      throw new Error(`Invalid tool metadata at ${metadataPath}: ${error.message}`, { cause: error })
    }
    validateMetadata(metadata, slug, metadataPath, toolDir)

    if (metadata.build.install?.length) await runToolCommand(metadata.build.install, toolDir, slug, 'build.install')
    await runToolCommand(metadata.build.command, toolDir, slug, 'build.command')

    const toolOutputDir = path.resolve(toolDir, metadata.build.outputDirectory)
    try {
      const outputIndex = await stat(path.join(toolOutputDir, 'index.html'))
      if (!outputIndex.isFile()) throw new Error('index.html is not a file')
    } catch (error) {
      throw new Error(`Tool ${slug} output at ${toolOutputDir} must contain index.html: ${error.message}`, { cause: error })
    }
    await cp(toolOutputDir, path.join(resolvedOutputDir, 'tools', slug), { recursive: true })
    tools.push({
      slug,
      category: metadata.category,
      actionLabel: metadata.actionLabel,
      name: metadata.name,
      summary: metadata.summary,
      href: `./tools/${slug}/`,
    })
  }

  await validatePublishedToolOutputs(resolvedOutputDir, tools.map(({ slug }) => slug))
  await writeFile(path.join(resolvedOutputDir, 'tools.json'), `${JSON.stringify({ schemaVersion: 1, tools }, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSite().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
