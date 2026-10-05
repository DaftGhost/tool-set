import path from 'node:path'
import { parseArgs } from 'node:util'
import { datasetVersion } from '../src/dataContract.ts'
import { expectedRowCount } from './sourceInventory.ts'
import { readSourceRows, verifySourceFiles } from './sourceFiles.ts'
import { prepareDatabase, exportSql } from './datasetPackage.ts'

const { values } = parseArgs({ options: { input: { type: 'string', default: '.local-data/usa-source' }, output: { type: 'string', default: `.local-data/${datasetVersion}` } } })
const input = path.resolve(values.input!), output = path.resolve(values.output!)
const files = await verifySourceFiles(input)
if (files.reduce((sum, file) => sum + file.rows, 0) !== expectedRowCount) throw new Error('Pinned source must contain exactly one million records')
console.log(JSON.stringify({ event: 'source_verified', files: files.length, rows: expectedRowCount }))
const prepared = await prepareDatabase({ rows: readSourceRows(input, files), output, files, expectedRows: expectedRowCount,
  onProgress(rows) { if (rows % 20000 === 0) console.log(JSON.stringify({ event: 'source_rows_verified', rows })) },
})
if (prepared.audit.databaseBytes >= 10000000000) throw new Error('Verified dataset exceeds the single-D1 limit; prepare a reviewed partition mapping before import')
const exported = await exportSql(prepared.database, output)
console.log(JSON.stringify({ directory: output, verifiedRows: prepared.audit.verifiedRows, databaseBytes: prepared.audit.databaseBytes, sqlBatches: exported.batches.length, publishedRemotely: false }, null, 2))
