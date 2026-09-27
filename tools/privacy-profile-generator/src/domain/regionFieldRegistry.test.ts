import { describe, expect, it } from 'vitest'
import { generateProfile } from './profileGenerator'
import { createRegionFieldRegistry, emptyRegionFieldRegistry } from './regionFieldRegistry'

describe('region field registry', () => {
  it('starts empty for every launch region', () => {
    expect(emptyRegionFieldRegistry.fieldsFor('zh-CN')).toEqual([])
    expect(emptyRegionFieldRegistry.fieldsFor('en-US')).toEqual([])
    expect(emptyRegionFieldRegistry.fieldsFor('en-GB')).toEqual([])
    expect(emptyRegionFieldRegistry.fieldsFor('ja-JP')).toEqual([])
    expect(emptyRegionFieldRegistry.fieldsFor('ko-KR')).toEqual([])
  })

  it('adds an extension only to the region that declares it', () => {
    const registry = createRegionFieldRegistry([
      {
        id: 'regional-example',
        regionId: 'ja-JP',
        label: '地区扩展示例',
        generate: () => ({ localValue: 'ローカル値', englishValue: 'Local value', englishStatus: 'converted' }),
      },
    ])

    const japaneseProfile = generateProfile('ja-JP', { seed: 4, id: 'jp', fieldRegistry: registry })
    const usProfile = generateProfile('en-US', { seed: 4, id: 'us', fieldRegistry: registry })

    expect(japaneseProfile.fields.at(-1)).toMatchObject({
      id: 'regional-example',
      label: '地区扩展示例',
      localValue: 'ローカル値',
      englishValue: 'Local value',
    })
    expect(usProfile.fields.some(({ id }) => id === 'regional-example')).toBe(false)
  })

  it('rejects duplicate extension identifiers within a region', () => {
    const extension = {
      id: 'regional-example',
      regionId: 'ja-JP' as const,
      label: '地区扩展示例',
      generate: () => ({ localValue: '値', englishStatus: 'same' as const }),
    }

    expect(() => createRegionFieldRegistry([extension, extension])).toThrow('Duplicate field id')
  })
})
