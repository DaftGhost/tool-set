import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { selectSubset, prepareSubset } from './subset.ts'
import { prepareDatabase } from './datasetPackage.ts'
import { parseFields } from '../src/dataContract.ts'
import { fields } from '../test/fixtures.ts'

describe('deployment subset selection', () => {
  const rows = Array.from({ length: 100 }, (_, sample_id) => ({ sample_id, uuid: String(sample_id) }))
  it('selects unique source rows reproducibly across the full population and restores source order', () => {
    const selected = selectSubset(rows, 10, 'fixed-version')
    expect(selectSubset([...rows].reverse(), 10, 'fixed-version')).toEqual(selected)
    expect(new Set(selected).size).toBe(10)
    expect(selected).toEqual([...selected].sort((a, b) => a - b))
    expect(selected.every(id => rows.some(row => row.sample_id === id))).toBe(true)
    expect(selected.some(id => id >= 50)).toBe(true)
    expect(selectSubset(rows, 10, 'other-version')).not.toEqual(selected)
  })
  it('rejects a count outside the available source population', () => {
    for (const count of [0, -1, 1.5, 101]) expect(() => selectSubset(rows, count, 'fixed-version')).toThrow('Invalid subset size')
  })
  it('keeps source fields intact, assigns a dense subset index, and leaves the source unchanged', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'persona-subset-'))
    try {
      const original = Array.from({ length: 6 }, (_, id) => ({ ...fields, uuid: id.toString(16).padStart(32, '0'), persona: `Person ${id}\n'original'` }))
      async function* sourceRows() { yield* original }
      const source = await prepareDatabase({ rows: sourceRows(), output: path.join(dir, 'source'), files: [], expectedRows: 6 })
      const output = path.join(dir, 'subset')
      const result = await prepareSubset(source.database, output, 3)
      const selection = JSON.parse(await readFile(path.join(output, 'selection.json'), 'utf8'))
      expect(result.rows).toBe(3)
      const target = new DatabaseSync(path.join(output, 'personas.sqlite'), { readOnly: true })
      try {
        const stored = target.prepare('SELECT * FROM personas ORDER BY sample_id').all()
        expect(stored.map(row => row.sample_id)).toEqual([0, 1, 2])
        expect(stored.map(parseFields)).toEqual(selection.sourceSampleIds.map((id: number) => original[id]))
        expect(target.prepare('SELECT row_count, status FROM dataset_metadata').get()).toMatchObject({ row_count: 3, status: 'ready' })
      } finally { target.close() }
      const sourceAgain = new DatabaseSync(source.database, { readOnly: true })
      try { expect(sourceAgain.prepare('SELECT * FROM personas ORDER BY sample_id').all().map(parseFields)).toEqual(original) }
      finally { sourceAgain.close() }
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
