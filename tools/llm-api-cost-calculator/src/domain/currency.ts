export type CurrencyCode = 'CNY' | 'USD'

export type ExchangeRateSnapshot = Readonly<{
  usdToCny: number
  date: string
  fetchedAt: number
}>

const numericInputPattern = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return value === 'CNY' || value === 'USD'
}

export function isRateDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isExchangeRateSnapshot(value: unknown): value is ExchangeRateSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.usdToCny === 'number'
    && Number.isFinite(record.usdToCny)
    && record.usdToCny > 0
    && isRateDate(record.date)
    && typeof record.fetchedAt === 'number'
    && Number.isFinite(record.fetchedAt)
    && record.fetchedAt > 0
}

function editableNumber(value: string): number | null {
  const normalized = value.trim()
  if (!numericInputPattern.test(normalized)) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function compactNumber(value: number): string {
  return Number(value.toPrecision(15)).toString()
}

export function displayPriceInput(cnyValue: string, currency: CurrencyCode, usdToCny: number): string {
  if (currency === 'CNY') return cnyValue
  const amount = editableNumber(cnyValue)
  return amount === null ? cnyValue : compactNumber(amount / usdToCny)
}

export function convertPriceInputToCny(value: string, currency: CurrencyCode, usdToCny: number): string {
  if (currency === 'CNY') return value
  const amount = editableNumber(value)
  return amount === null ? value : compactNumber(amount * usdToCny)
}

export function formatMoney(
  cnyValue: number,
  currency: CurrencyCode,
  usdToCny: number,
  maximumFractionDigits = 6,
): string {
  const amount = currency === 'USD' ? cnyValue / usdToCny : cnyValue
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(amount)
}
