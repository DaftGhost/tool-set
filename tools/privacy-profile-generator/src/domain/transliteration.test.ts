import { describe, expect, it } from 'vitest'
import { romanizeChinese, romanizeJapaneseKana, romanizeKorean } from './transliteration'

describe('regional romanization', () => {
  it('renders Mandarin names with tone-free Hanyu Pinyin', () => {
    expect(romanizeChinese('张三')).toBe('Zhang San')
    expect(romanizeChinese('单', true)).toBe('Shan')
  })

  it('renders Japanese kana with Hepburn long vowels', () => {
    expect(romanizeJapaneseKana('とうきょう')).toBe('Tōkyō')
  })

  it('applies Korean pronunciation rules and preserves given-name spelling', () => {
    expect(romanizeKorean('서울')).toBe('Seoul')
    expect(romanizeKorean('김민수')).toBe('Gimminsu')
    expect(romanizeKorean('신라')).toBe('Silla')
    expect(romanizeKorean('왕십리')).toBe('Wangsimni')
    expect(`${romanizeKorean('홍')} ${romanizeKorean('빛나', { isPersonalGivenName: true })}`).toBe('Hong Bitna')
  })
})
