import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'
import { parseArgs } from 'node:util'
import { datasetName, datasetVersion } from '../src/dataContract.ts'
import { sourceFiles } from './sourceInventory.ts'
import { fileHash } from './sourceFiles.ts'

const { values } = parseArgs({ options: { output: { type: 'string', default: '.local-data/usa-source' } } })
const output = path.resolve(values.output!)
await mkdir(output, { recursive: true })
for (const entry of sourceFiles) {
  const file = path.join(output, entry.name)
  const existing = await stat(file).catch(() => null)
  if (existing?.size === entry.bytes && await fileHash(file) === entry.sha256) { console.log(`Verified existing ${entry.name}`); continue }
  const response = await fetch(`https://huggingface.co/datasets/${datasetName}/resolve/${datasetVersion}/data/${entry.name}?download=true`, { signal: AbortSignal.timeout(300000) })
  if (!response.ok || !response.body) throw new Error(`Source download failed: ${entry.name} (${response.status})`)
  const temp = file + '.part'
  const writer = createWriteStream(temp)
  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!writer.write(value)) await once(writer, 'drain')
    }
    writer.end()
    await once(writer, 'finish')
  } finally { reader.releaseLock(); writer.destroy() }
  if ((await stat(temp)).size !== entry.bytes || await fileHash(temp) !== entry.sha256) throw new Error(`Downloaded source checksum mismatch: ${entry.name}`)
  await rename(temp, file)
  console.log(`Downloaded and verified ${entry.name}`)
}
