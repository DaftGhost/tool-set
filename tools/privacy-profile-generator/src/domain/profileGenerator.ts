import { Faker, en, en_GB, en_US, ja, ko, zh_CN } from '@faker-js/faker'
import { parsePhoneNumber } from 'libphonenumber-js'
import type { LocaleDefinition } from '@faker-js/faker'
import {
  commonFieldLabels,
  profileRegions,
  type GeneratedField,
  type ProfileSnapshot,
  type RegionId,
} from './profile'
import { emptyRegionFieldRegistry, type RegionFieldRegistry } from './regionFieldRegistry'
import { romanizeChinese, romanizeJapaneseKana, romanizeKorean } from './transliteration'

const dataVersion = '2026-09-r1'
const regionLocales: Record<RegionId, LocaleDefinition> = {
  'zh-CN': zh_CN,
  'en-US': en_US,
  'en-GB': en_GB,
  'ja-JP': ja,
  'ko-KR': ko,
}

const japaneseNames = [
  { family: '佐藤', familyReading: 'さとう', given: '葵', givenReading: 'あおい' },
  { family: '鈴木', familyReading: 'すずき', given: 'さくら', givenReading: 'さくら' },
  { family: '田中', familyReading: 'たなか', given: '遥', givenReading: 'はるか' },
  { family: '山本', familyReading: 'やまもと', given: '悠希', givenReading: 'ゆうき' },
  { family: '高橋', familyReading: 'たかはし', given: '蓮', givenReading: 'れん' },
] as const

const japaneseAddresses = [
  {
    prefecture: '東京都', prefectureReading: 'とうきょうと',
    prefectureEnglish: 'Tokyo',
    ward: '渋谷区', wardReading: 'しぶやく',
    wardEnglish: 'Shibuya-ku',
    area: '神南', areaReading: 'じんなん', postalCode: '150-0041',
    areaEnglish: 'Jinnan',
  },
  {
    prefecture: '大阪府', prefectureReading: 'おおさかふ',
    prefectureEnglish: 'Osaka',
    ward: '大阪市北区', wardReading: 'おおさかしきたく',
    wardEnglish: 'Kita-ku',
    area: '梅田', areaReading: 'うめだ', postalCode: '530-0001',
    areaEnglish: 'Umeda',
  },
  {
    prefecture: '京都府', prefectureReading: 'きょうとふ',
    prefectureEnglish: 'Kyoto',
    ward: '京都市中京区', wardReading: 'きょうとしなかぎょうく',
    wardEnglish: 'Nakagyō-ku',
    area: '烏丸通', areaReading: 'からすまどおり', postalCode: '604-8171',
    areaEnglish: 'Karasuma-dori',
  },
] as const

const chineseAddresses = [
  { province: '北京市', city: '北京市', district: '朝阳区', street: '光华路', postalCode: '100020' },
  { province: '上海市', city: '上海市', district: '浦东新区', street: '世纪大道', postalCode: '200120' },
  { province: '浙江省', city: '杭州市', district: '西湖区', street: '文三路', postalCode: '310012' },
] as const

const koreanAddresses = [
  { city: '서울특별시', cityEnglish: 'Seoul', district: '강남구', districtEnglish: 'Gangnam-gu', street: '테헤란로', streetEnglish: 'Teheran-ro', postalCode: '06236' },
  { city: '부산광역시', cityEnglish: 'Busan', district: '해운대구', districtEnglish: 'Haeundae-gu', street: '센텀중앙로', streetEnglish: 'Centumjungang-ro', postalCode: '48060' },
  { city: '인천광역시', cityEnglish: 'Incheon', district: '연수구', districtEnglish: 'Yeonsu-gu', street: '송도과학로', streetEnglish: 'Songdogwahak-ro', postalCode: '21984' },
] as const

const usAddressAreas = [
  { city: 'Austin', subdivision: 'Texas', postalCode: '78701' },
  { city: 'Portland', subdivision: 'Oregon', postalCode: '97201' },
  { city: 'Raleigh', subdivision: 'North Carolina', postalCode: '27601' },
] as const

const ukAddressAreas = [
  { city: 'London', postalCode: 'E1 6AN' },
  { city: 'Manchester', postalCode: 'M1 1AE' },
  { city: 'Edinburgh', postalCode: 'EH1 1BB' },
] as const

export interface GenerateProfileOptions {
  readonly seed?: number
  readonly id?: string
  readonly createdAt?: Date
  readonly fieldRegistry?: RegionFieldRegistry
}

function createFaker(regionId: RegionId, seed: number): Faker {
  const locale = regionLocales[regionId]
  const locales = regionId === 'en-US' || regionId === 'en-GB'
    ? [locale, en]
    : [locale]
  const faker = new Faker({ locale: locales })
  faker.seed(seed)
  return faker
}

function choose<T>(items: readonly T[], faker: Faker): T {
  return items[faker.number.int({ min: 0, max: items.length - 1 })]
}

function field(
  id: GeneratedField['id'],
  localValue: string,
  englishValue?: string,
  conversionStandard?: string,
): GeneratedField {
  return {
    id,
    label: commonFieldLabels[id as keyof typeof commonFieldLabels] ?? id,
    localValue,
    ...(englishValue ? { englishValue } : {}),
    englishStatus: englishValue ? 'converted' : 'same',
    ...(conversionStandard ? { conversionStandard } : {}),
  }
}

function birthDateField(regionId: RegionId, faker: Faker): GeneratedField {
  const date = faker.date.birthdate()
  const dateOnly = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12))
  const canonicalValue = [dateOnly.getUTCFullYear(), String(dateOnly.getUTCMonth() + 1).padStart(2, '0'), String(dateOnly.getUTCDate()).padStart(2, '0')].join('-')
  const englishValue = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(dateOnly)
  const localValue = new Intl.DateTimeFormat(regionId, {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(dateOnly)

  if (regionId === 'en-US' || regionId === 'en-GB') return { ...field('birthDate', localValue), canonicalValue }

  return { ...field('birthDate', localValue, englishValue, 'Unicode UTS #35 / CLDR date format'), canonicalValue }
}

function chineseName(faker: Faker): GeneratedField {
  const family = faker.person.lastName()
  const given = faker.person.firstName()
  const localValue = `${family}${given}`
  const givenPinyin = romanizeChinese(given).replaceAll(' ', '').toLowerCase()
  const givenEnglish = `${givenPinyin.charAt(0).toUpperCase()}${givenPinyin.slice(1)}`
  const englishValue = `${romanizeChinese(family, true)} ${givenEnglish}`

  return field('name', localValue, englishValue, 'ISO 7098:2015 / Hanyu Pinyin')
}

function japaneseName(faker: Faker): GeneratedField {
  const { family, familyReading, given, givenReading } = choose(japaneseNames, faker)
  const localValue = `${family} ${given}`
  const englishValue = `${romanizeJapaneseKana(familyReading)} ${romanizeJapaneseKana(givenReading)}`

  return field('name', localValue, englishValue, 'ISO 3602:1989 / Modified Hepburn (WanaKana)')
}

function koreanName(faker: Faker): GeneratedField {
  const family = faker.person.lastName()
  const given = faker.person.firstName()
  const localValue = `${family} ${given}`
  const englishValue = `${romanizeKorean(family)} ${romanizeKorean(given, { isPersonalGivenName: true })}`

  return field('name', localValue, englishValue, 'Korean National Institute of Korean Language Romanization')
}

function nameField(regionId: RegionId, faker: Faker): GeneratedField {
  if (regionId === 'zh-CN') return chineseName(faker)
  if (regionId === 'ja-JP') return japaneseName(faker)
  if (regionId === 'ko-KR') return koreanName(faker)
  return field('name', faker.person.fullName())
}

function chineseAddress(faker: Faker): { localValue: string; englishValue: string; postalCode: string } {
  const address = choose(chineseAddresses, faker)
  const building = faker.number.int({ min: 1, max: 99 })
  const cityEnglish = romanizeChinese(address.city)
  const provinceEnglish = address.city === address.province ? '' : `, ${romanizeChinese(address.province)}`

  return {
    localValue: `${address.province}${address.province === address.city ? '' : address.city}${address.district}${address.street}${building}号`,
    englishValue: `${building} ${romanizeChinese(address.street)}, ${romanizeChinese(address.district)}, ${cityEnglish}${provinceEnglish}`,
    postalCode: address.postalCode,
  }
}

function japaneseAddress(faker: Faker): { localValue: string; englishValue: string; postalCode: string } {
  const address = choose(japaneseAddresses, faker)
  const block = faker.number.int({ min: 1, max: 8 })
  const lot = faker.number.int({ min: 1, max: 24 })
  const building = faker.number.int({ min: 1, max: 12 })
  const streetNumber = `${block}-${lot}-${building}`
  return {
    localValue: `${address.prefecture}${address.ward}${address.area}${block}丁目${lot}-${building}号`,
    englishValue: `${streetNumber} ${address.areaEnglish}, ${address.wardEnglish}, ${address.prefectureEnglish}`,
    postalCode: address.postalCode,
  }
}

function koreanAddress(faker: Faker): { localValue: string; englishValue: string; postalCode: string } {
  const address = choose(koreanAddresses, faker)
  const building = faker.number.int({ min: 11, max: 99 })

  return {
    localValue: `${address.city} ${address.district} ${address.street} ${building}`,
    englishValue: `${building} ${address.streetEnglish}, ${address.districtEnglish}, ${address.cityEnglish}`,
    postalCode: address.postalCode,
  }
}

function englishAddress(regionId: 'en-US' | 'en-GB', faker: Faker): { localValue: string; postalCode: string } {
  const street = faker.location.streetAddress()
  if (regionId === 'en-US') {
    const area = choose(usAddressAreas, faker)
    return {
      localValue: `${street}, ${area.city}, ${area.subdivision}`,
      postalCode: area.postalCode,
    }
  }

  const area = choose(ukAddressAreas, faker)
  return {
    localValue: `${street}, ${area.city}`,
    postalCode: area.postalCode,
  }
}

function addressFields(regionId: RegionId, faker: Faker): [GeneratedField, GeneratedField] {
  if (regionId === 'zh-CN') {
    const address = chineseAddress(faker)
    return [
      field('address', address.localValue, address.englishValue, 'ISO 7098:2015 / Hanyu Pinyin; UPU S42 order'),
      field('postalCode', address.postalCode),
    ]
  }

  if (regionId === 'ja-JP') {
    const address = japaneseAddress(faker)
    return [
      field('address', address.localValue, address.englishValue, 'ISO 3602:1989 / Hepburn; UPU S42 order'),
      field('postalCode', address.postalCode),
    ]
  }

  if (regionId === 'ko-KR') {
    const address = koreanAddress(faker)
    return [
      field('address', address.localValue, address.englishValue, 'Korean National Institute Romanization; UPU S42 order'),
      field('postalCode', address.postalCode),
    ]
  }

  const address = englishAddress(regionId, faker)
  return [field('address', address.localValue), field('postalCode', address.postalCode)]
}

function phoneField(regionId: RegionId, faker: Faker): { field: GeneratedField; risk: ProfileSnapshot['phoneRisk'] } {
  if (regionId === 'en-US') {
    const lineNumber = String(faker.number.int({ min: 0, max: 99 })).padStart(2, '0')
    const national = parsePhoneNumber(`+120255501${lineNumber}`, 'US')?.formatNational()
    if (!national) throw new Error('Could not format the reserved US fictional phone range')
    return { field: field('phone', `+1 ${national}`), risk: 'fictional-range' }
  }

  if (regionId === 'en-GB') {
    const lineNumber = String(faker.number.int({ min: 0, max: 999 })).padStart(3, '0')
    const national = parsePhoneNumber(`+447700900${lineNumber}`, 'GB')?.formatNational()
    if (!national) throw new Error('Could not format the reserved UK fictional phone range')
    return { field: field('phone', national), risk: 'fictional-range' }
  }

  const nationalNumber = faker.string.numeric(8)
  const callingCode = regionId === 'zh-CN' ? '+86' : regionId === 'ja-JP' ? '+81' : '+82'
  const mobilePrefix = regionId === 'zh-CN' ? '131' : regionId === 'ja-JP' ? '090' : '010'
  const parsed = parsePhoneNumber(`${callingCode}${mobilePrefix}${nationalNumber}`)
  if (!parsed) throw new Error(`Could not format the ${regionId} mobile-number shape`)

  return { field: field('phone', parsed.formatNational()), risk: 'may-be-assigned' }
}

function emailField(faker: Faker): GeneratedField {
  return field('email', `${faker.string.alphanumeric(10).toLowerCase()}@example.invalid`)
}

function generatedAt(options: GenerateProfileOptions): string {
  return (options.createdAt ?? new Date()).toISOString()
}

function profileId(options: GenerateProfileOptions): string {
  return options.id ?? crypto.randomUUID()
}

export function generateProfile(regionId: RegionId, options: GenerateProfileOptions = {}): ProfileSnapshot {
  if (!profileRegions.some((region) => region.id === regionId)) throw new Error(`Unsupported profile region: ${regionId}`)

  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32)
  const faker = createFaker(regionId, seed)
  const { field: phone, risk: phoneRisk } = phoneField(regionId, faker)
  const notices = ['synthetic-profile']
  if (phoneRisk === 'may-be-assigned') notices.push('phone-may-belong-to-a-real-subscriber')
  const fields = [
    nameField(regionId, faker),
    birthDateField(regionId, faker),
    ...addressFields(regionId, faker),
    emailField(faker),
    phone,
    ...(options.fieldRegistry ?? emptyRegionFieldRegistry).fieldsFor(regionId).map((definition) => ({
      id: definition.id,
      label: definition.label,
      ...definition.generate(),
    })),
  ]
  const frozenFields = fields.map((generatedField) => Object.freeze(generatedField))

  return Object.freeze({
    schemaVersion: 1,
    id: profileId(options),
    regionId,
    createdAt: generatedAt(options),
    dataVersion,
    phoneRisk,
    notices: Object.freeze(notices),
    fields: Object.freeze(frozenFields),
  })
}
