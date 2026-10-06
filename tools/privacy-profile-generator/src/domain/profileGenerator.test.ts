import { describe, expect, it, vi } from 'vitest'
import { generateProfile } from './profileGenerator'
import type { RegionId } from './profile'

const regions: RegionId[] = ['zh-CN', 'en-US', 'en-GB', 'ja-JP', 'ko-KR']
const commonFieldIds = ['name', 'birthDate', 'address', 'postalCode', 'email', 'phone']

const mainlandAddressSamples = [
  { localBase: '北京市朝阳区光华路', postalCode: '100020', englishBase: 'Guang Hua Lu, Chao Yang Qu, Bei Jing Shi' },
  { localBase: '天津市和平区和平路', postalCode: '300020', englishBase: 'He Ping Lu, He Ping Qu, Tian Jin Shi' },
  { localBase: '河北省石家庄市长安区和平东路', postalCode: '050031', englishBase: 'He Ping Dong Lu, Chang An Qu, Shi Jia Zhuang Shi, He Bei Sheng' },
  { localBase: '山西省太原市迎泽区五一路', postalCode: '030002', englishBase: 'Wu Yi Lu, Ying Ze Qu, Tai Yuan Shi, Shan Xi Sheng' },
  { localBase: '内蒙古自治区呼和浩特市赛罕区新建西街', postalCode: '010020', englishBase: 'Xin Jian Xi Jie, Sai Han Qu, Hu He Hao Te Shi, Nei Meng Gu Zi Zhi Qu' },
  { localBase: '辽宁省沈阳市和平区三好街', postalCode: '110004', englishBase: 'San Hao Jie, He Ping Qu, Shen Yang Shi, Liao Ning Sheng' },
  { localBase: '吉林省长春市南关区东岭南街', postalCode: '130022', englishBase: 'Dong Ling Nan Jie, Nan Guan Qu, Chang Chun Shi, Ji Lin Sheng' },
  { localBase: '黑龙江省哈尔滨市南岗区保健路', postalCode: '150081', englishBase: 'Bao Jian Lu, Nan Gang Qu, Ha Er Bin Shi, Hei Long Jiang Sheng' },
  { localBase: '上海市浦东新区世纪大道', postalCode: '200135', englishBase: 'Shi Ji Da Dao, Pu Dong Xin Qu, Shang Hai Shi' },
  { localBase: '江苏省南京市鼓楼区凤凰西街', postalCode: '210029', englishBase: 'Feng Huang Xi Jie, Gu Lou Qu, Nan Jing Shi, Jiang Su Sheng' },
  { localBase: '浙江省杭州市西湖区古翠路', postalCode: '310012', englishBase: 'Gu Cui Lu, Xi Hu Qu, Hang Zhou Shi, Zhe Jiang Sheng' },
  { localBase: '安徽省合肥市包河区繁华大道', postalCode: '230051', englishBase: 'Fan Hua Da Dao, Bao He Qu, He Fei Shi, An Hui Sheng' },
  { localBase: '福建省福州市鼓楼区古田路', postalCode: '350005', englishBase: 'Gu Tian Lu, Gu Lou Qu, Fu Zhou Shi, Fu Jian Sheng' },
  { localBase: '江西省南昌市东湖区叠山路', postalCode: '330006', englishBase: 'Die Shan Lu, Dong Hu Qu, Nan Chang Shi, Jiang Xi Sheng' },
  { localBase: '山东省济南市历下区按察司街', postalCode: '250011', englishBase: 'An Cha Si Jie, Li Xia Qu, Ji Nan Shi, Shan Dong Sheng' },
  { localBase: '河南省郑州市金水区金水东路', postalCode: '450046', englishBase: 'Jin Shui Dong Lu, Jin Shui Qu, Zheng Zhou Shi, He Nan Sheng' },
  { localBase: '湖北省武汉市江汉区中山大道', postalCode: '430021', englishBase: 'Zhong Shan Da Dao, Jiang Han Qu, Wu Han Shi, Hu Bei Sheng' },
  { localBase: '湖南省长沙市芙蓉区远大一路', postalCode: '410001', englishBase: 'Yuan Da Yi Lu, Fu Rong Qu, Chang Sha Shi, Hu Nan Sheng' },
  { localBase: '广东省广州市越秀区东湖西路', postalCode: '510100', englishBase: 'Dong Hu Xi Lu, Yue Xiu Qu, Guang Zhou Shi, Guang Dong Sheng' },
  { localBase: '广西壮族自治区南宁市青秀区佛子岭路', postalCode: '530025', englishBase: 'Fo Zi Ling Lu, Qing Xiu Qu, Nan Ning Shi, Guang Xi Zhuang Zu Zi Zhi Qu' },
  { localBase: '海南省海口市美兰区人民大道', postalCode: '570208', englishBase: 'Ren Min Da Dao, Mei Lan Qu, Hai Kou Shi, Hai Nan Sheng' },
  { localBase: '重庆市渝中区中兴路', postalCode: '400010', englishBase: 'Zhong Xing Lu, Yu Zhong Qu, Chong Qing Shi' },
  { localBase: '四川省成都市锦江区中道街', postalCode: '610020', englishBase: 'Zhong Dao Jie, Jin Jiang Qu, Cheng Du Shi, Si Chuan Sheng' },
  { localBase: '贵州省贵阳市南明区博爱路', postalCode: '550002', englishBase: 'Bo Ai Lu, Nan Ming Qu, Gui Yang Shi, Gui Zhou Sheng' },
  { localBase: '云南省昆明市五华区二环西路', postalCode: '650106', englishBase: 'Er Huan Xi Lu, Wu Hua Qu, Kun Ming Shi, Yun Nan Sheng' },
  { localBase: '西藏自治区拉萨市城关区吉拉路', postalCode: '850009', englishBase: 'Ji La Lu, Cheng Guan Qu, La Sa Shi, Xi Zang Zi Zhi Qu' },
  { localBase: '陕西省西安市碑林区三学街', postalCode: '710001', englishBase: 'San Xue Jie, Bei Lin Qu, Xi An Shi, Shan Xi Sheng' },
  { localBase: '甘肃省兰州市城关区东岗东路', postalCode: '730020', englishBase: 'Dong Gang Dong Lu, Cheng Guan Qu, Lan Zhou Shi, Gan Su Sheng' },
  { localBase: '青海省西宁市城中区北斗宫街', postalCode: '810099', englishBase: 'Bei Dou Gong Jie, Cheng Zhong Qu, Xi Ning Shi, Qing Hai Sheng' },
  { localBase: '宁夏回族自治区银川市兴庆区中山北街', postalCode: '750004', englishBase: 'Zhong Shan Bei Jie, Xing Qing Qu, Yin Chuan Shi, Ning Xia Hui Zu Zi Zhi Qu' },
  { localBase: '新疆维吾尔自治区乌鲁木齐市天山区胜利路', postalCode: '830049', englishBase: 'Sheng Li Lu, Tian Shan Qu, Wu Lu Mu Qi Shi, Xin Jiang Wei Wu Er Zi Zhi Qu' },
] as const

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
    ['zh-CN', /^1\d{2} \d{4} \d{4}$/],
    ['ja-JP', /^090-\d{4}-\d{4}$/],
    ['ko-KR', /^010-\d{4}-\d{4}$/],
  ] as const)('uses the expected format-only phone shape for %s', (regionId, pattern) => {
    const phone = createProfile(regionId).fields.find(({ id }) => id === 'phone')?.localValue

    expect(phone).toMatch(pattern)
  })

  it('covers all 31 mainland provincial regions across fixed seeds', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'))
    try {
      const provinces = new Set<string>()
      for (let seed = 0; seed < 512; seed += 1) {
        const profile = generateProfile('zh-CN', { seed })
        const address = profile.fields.find(({ id }) => id === 'address')!
        provinces.add(address.localValue.match(/^.+?(?:省|市|自治区)/u)![0])
        const base = address.localValue.replace(/\d+号$/u, '')
        const sample = mainlandAddressSamples.find(({ localBase }) => localBase === base)
        expect(sample, address.localValue).toBeDefined()
        const building = address.localValue.match(/(\d+)号$/u)![1]
        expect(address.englishValue).toBe(`${building} ${sample!.englishBase}`)
        expect(profile.fields.find(({ id }) => id === 'postalCode')!.localValue).toBe(sample!.postalCode)
        expect(profile.dataVersion).toBe('2026-10-r1')
        expect(address.englishValue).toMatch(/^[\p{Script=Latin}\d\s.,'-]+$/u)
        expect(address.localValue).not.toMatch(/(北京市|天津市|上海市|重庆市)\1/u)
      }
      expect([...provinces].sort()).toEqual([
        '北京市', '天津市', '河北省', '山西省', '内蒙古自治区', '辽宁省', '吉林省', '黑龙江省',
        '上海市', '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省', '河南省',
        '湖北省', '湖南省', '广东省', '广西壮族自治区', '海南省', '重庆市', '四川省',
        '贵州省', '云南省', '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区', '新疆维吾尔自治区',
      ].sort())
    } finally {
      vi.useRealTimers()
    }
  })

  it('varies mainland mobile prefixes while preserving eleven digits and the risk notice', () => {
    const allowedPrefixes = [
      '130', '131', '132', '133', '135', '136', '137', '138', '139',
      '150', '151', '152', '153', '155', '156', '157', '158', '159',
      '180', '181', '182', '183', '184', '185', '186', '187', '188', '189', '190', '192', '196', '197',
    ]
    const prefixes = new Set<string>()
    for (let seed = 0; seed < 512; seed += 1) {
      const profile = generateProfile('zh-CN', { seed })
      const phone = profile.fields.find(({ id }) => id === 'phone')!.localValue
      expect(phone).toMatch(/^1\d{2} \d{4} \d{4}$/)
      expect(phone.replaceAll(' ', '')).toHaveLength(11)
      expect(allowedPrefixes).toContain(phone.slice(0, 3))
      prefixes.add(phone.slice(0, 3))
      expect(profile.phoneRisk).toBe('may-be-assigned')
      expect(profile.notices).toContain('phone-may-belong-to-a-real-subscriber')
    }
    expect([...prefixes].sort()).toEqual(allowedPrefixes.sort())
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
