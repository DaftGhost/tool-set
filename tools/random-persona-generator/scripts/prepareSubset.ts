import path from 'node:path'
import { parseArgs } from 'node:util'
import { datasetVersion } from '../src/dataContract.ts'
import { prepareSubset } from './subset.ts'

const { values } = parseArgs({ options: {
  input: { type: 'string', default: `.local-data/${datasetVersion}/personas.sqlite` },
  output: { type: 'string', default: `.local-data/${datasetVersion}-40k` },
} })
console.log(JSON.stringify(await prepareSubset(path.resolve(values.input!), path.resolve(values.output!), 40000), null, 2))
