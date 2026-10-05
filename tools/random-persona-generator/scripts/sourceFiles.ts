import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { fieldNames } from '../src/dataContract.ts'
import { sourceFiles } from './sourceInventory.ts'
import type { SourceFile } from './datasetPackage.ts'

export async function fileHash(file: string) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(file)) digest.update(chunk)
  return digest.digest('hex')
}

export async function verifySourceFiles(input: string): Promise<SourceFile[]> {
  const inventory: SourceFile[] = []
  for (const entry of sourceFiles) {
    const name = path.join(input, entry.name)
    if ((await stat(name)).size !== entry.bytes || await fileHash(name) !== entry.sha256) throw new Error(`Pinned source checksum mismatch: ${entry.name}`)
    const metadata = await parquetMetadataAsync(await asyncBufferFromFile(name))
    const columns = metadata.schema.slice(1).map(column => column.name)
    if (columns.length !== fieldNames.length || fieldNames.some(key => !columns.includes(key))) throw new Error(`Incompatible Parquet schema: ${entry.name}`)
    inventory.push({ ...entry, rows: Number(metadata.num_rows) })
  }
  return inventory
}

export async function* readSourceRows(input: string, inventory: SourceFile[]) {
  for (const entry of inventory) {
    const file = await asyncBufferFromFile(path.join(input, entry.name))
    const metadata = await parquetMetadataAsync(file)
    let offset = 0
    for (const group of metadata.row_groups) {
      const count = Number(group.num_rows)
      const rows = await parquetReadObjects({ file, metadata, columns: [...fieldNames], rowStart: offset, rowEnd: offset + count })
      if (rows.length !== count) throw new Error(`Row-group count mismatch: ${entry.name}/${offset}`)
      for (const row of rows) yield row
      offset += count
    }
    if (offset !== entry.rows) throw new Error(`Source count mismatch: ${entry.name}`)
  }
}
