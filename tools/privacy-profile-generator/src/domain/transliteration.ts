import { romanize } from 'koroman'
import { pinyin } from 'pinyin-pro'
import { toRomaji } from 'wanakana'

export interface KoreanRomanizationOptions {
  readonly isPersonalGivenName?: boolean
}

function titleCaseWords(value: string): string {
  return value.replace(/(^|[\s,-])([a-z])/g, (_match, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`)
}

export function romanizeChinese(value: string, isSurname = false): string {
  const romanized = pinyin(value, { toneType: 'none', surname: isSurname ? 'head' : 'off' })
  const compacted = romanized.replace(/(?<=\d)\s+(?=\d)/g, '').replace(/\s+/g, ' ').trim()

  return titleCaseWords(compacted)
}

function macronizeJapaneseLongVowels(value: string): string {
  return value
    .replace(/ou/g, 'ō')
    .replace(/oo/g, 'ō')
    .replace(/uu/g, 'ū')
    .replace(/aa/g, 'ā')
    .replace(/ii/g, 'ī')
    .replace(/ee/g, 'ē')
}

export function romanizeJapaneseKana(value: string): string {
  return titleCaseWords(macronizeJapaneseLongVowels(toRomaji(value).toLowerCase()))
}

export function romanizeKorean(value: string, options: KoreanRomanizationOptions = {}): string {
  return romanize(value, {
    casingOption: 'capitalize-word',
    usePronunciationRules: !options.isPersonalGivenName,
  })
}
