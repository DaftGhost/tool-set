import path from 'node:path'
import { parseArgs } from 'node:util'
import { datasetVersion } from '../src/dataContract.ts'
import { importSqlPackage } from './localImport.ts'
import { configureLocalRuntime, persistencePath } from './localRuntime.ts'

const { values } = parseArgs({ options: { input: { type: 'string', default: `.local-data/${datasetVersion}` } } })
configureLocalRuntime()
const { getPlatformProxy } = await import('wrangler')
const platform = await getPlatformProxy<Pick<Env, 'PERSONAS_DB'>>({ configPath: 'wrangler.local.json', persist: { path: path.join(persistencePath, 'v3') }, remoteBindings: false })
try {
  const result = await importSqlPackage(path.resolve(values.input!), platform.env.PERSONAS_DB, rows => console.log(JSON.stringify({ event: 'local_d1_rows_verified', rows })))
  console.log(JSON.stringify(result, null, 2))
} finally { await platform.dispose() }
