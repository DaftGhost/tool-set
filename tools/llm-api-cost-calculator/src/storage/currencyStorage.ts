import { isCurrencyCode, isExchangeRateSnapshot } from '../domain/currency'
import type { CurrencyCode, ExchangeRateSnapshot } from '../domain/currency'

const STORAGE_KEY = 'tool-set:llm-api-cost-calculator:currency:v1'

export type CurrencyPreferences = Readonly<{
  currency: CurrencyCode
  rate: ExchangeRateSnapshot | null
}>

export function loadCurrencyPreferences(): CurrencyPreferences | null {
  let serialized: string | null
  try {
    serialized = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (serialized === null) return null

  try {
    const value: unknown = JSON.parse(serialized)
    if (typeof value !== 'object' || value === null) return null
    const record = value as Record<string, unknown>
    const rate = record.rate === null || isExchangeRateSnapshot(record.rate) ? record.rate : undefined
    if (!isCurrencyCode(record.currency) || rate === undefined || (record.currency === 'USD' && rate === null)) return null
    return { currency: record.currency, rate }
  } catch {
    return null
  }
}

export function saveCurrencyPreferences(preferences: CurrencyPreferences): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    return true
  } catch {
    return false
  }
}
