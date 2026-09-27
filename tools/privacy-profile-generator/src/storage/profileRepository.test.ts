import { beforeEach, describe, expect, it } from 'vitest'
import { generateProfile } from '../domain/profileGenerator'
import { IndexedDbProfileRepository } from './profileRepository'

describe('IndexedDbProfileRepository', () => {
  let repository: IndexedDbProfileRepository

  beforeEach(() => {
    repository = new IndexedDbProfileRepository(`profile-history-${crypto.randomUUID()}`)
  })

  it('keeps generated snapshots available in newest-first order', async () => {
    const first = generateProfile('en-US', {
      seed: 1,
      id: 'first',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    const second = generateProfile('ja-JP', {
      seed: 2,
      id: 'second',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    })

    await repository.save(first)
    await repository.save(second)

    await expect(repository.listAll()).resolves.toEqual([second, first])
  })

  it('removes every saved snapshot when history is cleared', async () => {
    await repository.save(generateProfile('ko-KR', { seed: 5, id: 'record' }))

    await repository.clearAll()

    await expect(repository.listAll()).resolves.toEqual([])
  })
})
