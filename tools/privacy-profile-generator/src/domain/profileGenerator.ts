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

const dataVersion = '2026-10-r1'
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
  { province: '天津市', city: '天津市', district: '和平区', street: '和平路', postalCode: '300020' },
  { province: '河北省', city: '石家庄市', district: '长安区', street: '和平东路', postalCode: '050031' },
  { province: '山西省', city: '太原市', district: '迎泽区', street: '五一路', postalCode: '030002' },
  { province: '内蒙古自治区', city: '呼和浩特市', district: '赛罕区', street: '新建西街', postalCode: '010020' },
  { province: '辽宁省', city: '沈阳市', district: '和平区', street: '三好街', postalCode: '110004' },
  { province: '吉林省', city: '长春市', district: '南关区', street: '东岭南街', postalCode: '130022' },
  { province: '黑龙江省', city: '哈尔滨市', district: '南岗区', street: '保健路', postalCode: '150081' },
  { province: '上海市', city: '上海市', district: '浦东新区', street: '世纪大道', postalCode: '200135' },
  { province: '江苏省', city: '南京市', district: '鼓楼区', street: '凤凰西街', postalCode: '210029' },
  { province: '浙江省', city: '杭州市', district: '西湖区', street: '古翠路', postalCode: '310012' },
  { province: '安徽省', city: '合肥市', district: '包河区', street: '繁华大道', postalCode: '230051' },
  { province: '福建省', city: '福州市', district: '鼓楼区', street: '古田路', postalCode: '350005' },
  { province: '江西省', city: '南昌市', district: '东湖区', street: '叠山路', postalCode: '330006' },
  { province: '山东省', city: '济南市', district: '历下区', street: '按察司街', postalCode: '250011' },
  { province: '河南省', city: '郑州市', district: '金水区', street: '金水东路', postalCode: '450046' },
  { province: '湖北省', city: '武汉市', district: '江汉区', street: '中山大道', postalCode: '430021' },
  { province: '湖南省', city: '长沙市', district: '芙蓉区', street: '远大一路', postalCode: '410001' },
  { province: '广东省', city: '广州市', district: '越秀区', street: '东湖西路', postalCode: '510100' },
  { province: '广西壮族自治区', city: '南宁市', district: '青秀区', street: '佛子岭路', postalCode: '530025' },
  { province: '海南省', city: '海口市', district: '美兰区', street: '人民大道', postalCode: '570208' },
  { province: '重庆市', city: '重庆市', district: '渝中区', street: '中兴路', postalCode: '400010' },
  { province: '四川省', city: '成都市', district: '锦江区', street: '中道街', postalCode: '610020' },
  { province: '贵州省', city: '贵阳市', district: '南明区', street: '博爱路', postalCode: '550002' },
  { province: '云南省', city: '昆明市', district: '五华区', street: '二环西路', postalCode: '650106' },
  { province: '西藏自治区', city: '拉萨市', district: '城关区', street: '吉拉路', postalCode: '850009' },
  { province: '陕西省', city: '西安市', district: '碑林区', street: '三学街', postalCode: '710001' },
  { province: '甘肃省', city: '兰州市', district: '城关区', street: '东岗东路', postalCode: '730020' },
  { province: '青海省', city: '西宁市', district: '城中区', street: '北斗宫街', postalCode: '810099' },
  { province: '宁夏回族自治区', city: '银川市', district: '兴庆区', street: '中山北街', postalCode: '750004' },
  { province: '新疆维吾尔自治区', city: '乌鲁木齐市', district: '天山区', street: '胜利路', postalCode: '830049' },
] as const

const chineseMobilePrefixes = [
  '130', '131', '132', '133', '135', '136', '137', '138', '139',
  '150', '151', '152', '153', '155', '156', '157', '158', '159',
  '180', '181', '182', '183', '184', '185', '186', '187', '188', '189', '190', '192', '196', '197',
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
  const mobilePrefix = regionId === 'zh-CN' ? choose(chineseMobilePrefixes, faker) : regionId === 'ja-JP' ? '090' : '010'
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
