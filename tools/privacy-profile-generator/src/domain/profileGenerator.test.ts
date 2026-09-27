import { describe, expect, it } from 'vitest'
import { generateProfile } from './profileGenerator'
import type { RegionId } from './profile'

const regions: RegionId[] = ['zh-CN', 'en-US', 'en-GB', 'ja-JP', 'ko-KR']
const commonFieldIds = ['name', 'birthDate', 'address', 'postalCode', 'email', 'phone']

function createProfile(regionId: RegionId) {
  return generateProfile(regionId, {
    seed: 1284,
    id: `test-${regionId}`,
    createdAt: new Date('1992-03-14T00:00:00.000Z'),
  })
}

describe('generateProfile', () => {
  it.each(regions)('generates one complete region-coordinated profile for %s', (regionId) => {
    const profile = createProfile(regionId)

    expect(profile.regionId).toBe(regionId)
    expect(profile.fields.map(({ id }) => id)).toEqual(commonFieldIds)
    expect(profile.fields.every(({ localValue }) => localValue.trim().length > 0)).toBe(true)
    expect(profile.fields.find(({ id }) => id === 'birthDate')?.canonicalValue).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Object.isFrozen(profile)).toBe(true)
    expect(Object.isFrozen(profile.fields)).toBe(true)
    expect(profile.fields.every((generatedField) => Object.isFrozen(generatedField))).toBe(true)
  })

  it.each(['zh-CN', 'ja-JP', 'ko-KR'] as RegionId[])(
    'provides the local and English form of each convertible field for %s',
    (regionId) => {
      const profile = createProfile(regionId)
      const fields = new Map(profile.fields.map((field) => [field.id, field]))

      for (const id of ['name', 'birthDate', 'address']) {
        expect(fields.get(id)?.englishValue, `${regionId}:${id}`).toBeTruthy()
        expect(fields.get(id)?.englishStatus, `${regionId}:${id}`).toBe('converted')
        expect(fields.get(id)?.conversionStandard, `${regionId}:${id}`).toBeTruthy()
        expect(fields.get(id)?.englishValue).toMatch(/^[\p{Script=Latin}\d\s.,'-]+$/u)
      }

      for (const id of ['postalCode', 'email', 'phone']) {
        expect(fields.get(id)?.englishValue, `${regionId}:${id}`).toBeUndefined()
        expect(fields.get(id)?.englishStatus, `${regionId}:${id}`).toBe('same')
      }
    },
  )

  it.each(['en-US', 'en-GB'] as RegionId[])(
    'marks English as the local language for %s without duplicating values',
    (regionId) => {
      const profile = createProfile(regionId)

      expect(profile.fields.every((field) => field.englishStatus === 'same')).toBe(true)
      expect(profile.fields.every((field) => field.englishValue === undefined)).toBe(true)
    },
  )

  it.each(regions)('uses a non-deliverable reserved email domain for %s', (regionId) => {
    const email = createProfile(regionId).fields.find(({ id }) => id === 'email')?.localValue

    expect(email).toMatch(/^[^\s@]+@[^\s@]+\.invalid$/)
  })

  it('keeps US phone values inside the published fictional range', () => {
    const phone = createProfile('en-US').fields.find(({ id }) => id === 'phone')?.localValue

    expect(phone).toMatch(/^\+1 \(202\) 555-01\d{2}$/)
  })

  it('keeps UK phone values inside the published fictional range', () => {
    const phone = createProfile('en-GB').fields.find(({ id }) => id === 'phone')?.localValue

    expect(phone).toMatch(/^07700 900\d{3}$/)
  })

  it('pairs English locality and postal values from one regional address preset', () => {
    const usProfile = createProfile('en-US')
    const ukProfile = createProfile('en-GB')
    const usAddress = usProfile.fields.find(({ id }) => id === 'address')?.localValue ?? ''
    const usPostalCode = usProfile.fields.find(({ id }) => id === 'postalCode')?.localValue ?? ''
    const ukAddress = ukProfile.fields.find(({ id }) => id === 'address')?.localValue ?? ''
    const ukPostalCode = ukProfile.fields.find(({ id }) => id === 'postalCode')?.localValue ?? ''

    expect(usAddress).toMatch(/Austin, Texas|Portland, Oregon|Raleigh, North Carolina/)
    expect(usPostalCode).toMatch(/78701|97201|27601/)
    expect(ukAddress).toMatch(/London|Manchester|Edinburgh/)
    expect(ukPostalCode).toMatch(/E1 6AN|M1 1AE|EH1 1BB/)
    expect(romanizedRegionPair(usAddress, usPostalCode)).toBe(true)
    expect(romanizedRegionPair(ukAddress, ukPostalCode)).toBe(true)
  })

  it.each(['zh-CN', 'ja-JP', 'ko-KR'] as RegionId[])(
    'marks %s phone values as potentially assigned',
    (regionId) => {
      const profile = createProfile(regionId)

      expect(profile.phoneRisk).toBe('may-be-assigned')
      expect(profile.notices).toContain('phone-may-belong-to-a-real-subscriber')
    },
  )

  it.each([
    ['zh-CN', /^\d{6}$/],
    ['ja-JP', /^\d{3}-\d{4}$/],
    ['ko-KR', /^\d{5}$/],
  ] as const)('keeps the postal value in the selected region shape for %s', (regionId, pattern) => {
    const postalCode = createProfile(regionId).fields.find(({ id }) => id === 'postalCode')?.localValue

    expect(postalCode).toMatch(pattern)
  })

  it.each([
    ['zh-CN', /^131 \d{4} \d{4}$/],
    ['ja-JP', /^090-\d{4}-\d{4}$/],
    ['ko-KR', /^010-\d{4}-\d{4}$/],
  ] as const)('uses the expected format-only phone shape for %s', (regionId, pattern) => {
    const phone = createProfile(regionId).fields.find(({ id }) => id === 'phone')?.localValue

    expect(phone).toMatch(pattern)
  })

  it('starts without region-specific extension fields', () => {
    const profile = createProfile('ja-JP')

    expect(profile.fields).toHaveLength(6)
  })

  it('orders English addresses using readable national place names', () => {
    const japaneseAddress = createProfile('ja-JP').fields.find(({ id }) => id === 'address')?.englishValue
    const chineseAddress = createProfile('zh-CN').fields.find(({ id }) => id === 'address')?.localValue

    expect(japaneseAddress).toMatch(/^\d+-\d+-\d+ .+, .+-ku, (Tokyo|Osaka|Kyoto)$/)
    expect(chineseAddress).not.toMatch(/北京市北京市|上海市上海市/)
  })
})

function romanizedRegionPair(address: string, postalCode: string): boolean {
  return (address.includes('Austin, Texas') && postalCode === '78701')
    || (address.includes('Portland, Oregon') && postalCode === '97201')
    || (address.includes('Raleigh, North Carolina') && postalCode === '27601')
    || (address.includes('London') && postalCode === 'E1 6AN')
    || (address.includes('Manchester') && postalCode === 'M1 1AE')
    || (address.includes('Edinburgh') && postalCode === 'EH1 1BB')
}
