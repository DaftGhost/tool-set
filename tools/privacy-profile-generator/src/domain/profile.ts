export const profileRegions = [
  { id: 'zh-CN', label: '中国大陆', englishLabel: 'Mainland China' },
  { id: 'en-US', label: '美国', englishLabel: 'United States' },
  { id: 'en-GB', label: '英国', englishLabel: 'United Kingdom' },
  { id: 'ja-JP', label: '日本', englishLabel: 'Japan' },
  { id: 'ko-KR', label: '韩国', englishLabel: 'South Korea' },
] as const

export type RegionId = (typeof profileRegions)[number]['id']
export type ProfileFieldId = 'name' | 'birthDate' | 'address' | 'postalCode' | 'email' | 'phone'
export type EnglishStatus = 'same' | 'converted' | 'no-standard-form'
export type PhoneRisk = 'fictional-range' | 'may-be-assigned'

export interface GeneratedField {
  readonly id: ProfileFieldId | string
  readonly label: string
  readonly localValue: string
  readonly englishValue?: string
  readonly canonicalValue?: string
  readonly englishStatus: EnglishStatus
  readonly conversionStandard?: string
}

export interface ProfileSnapshot {
  readonly schemaVersion: 1
  readonly id: string
  readonly regionId: RegionId
  readonly createdAt: string
  readonly dataVersion: string
  readonly phoneRisk: PhoneRisk
  readonly notices: readonly string[]
  readonly fields: readonly GeneratedField[]
}

export const commonFieldLabels: Readonly<Record<ProfileFieldId, string>> = {
  name: '姓名',
  birthDate: '出生日期',
  address: '地址',
  postalCode: '邮政编码',
  email: '邮箱',
  phone: '手机号',
}
