import { isRateDate } from '../domain/currency'
import type { ExchangeRateSnapshot } from '../domain/currency'

const USD_CNY_RATE_URL = 'https://api.frankfurter.dev/v2/rate/usd/cny'

export async function fetchLatestUsdCnyRate(): Promise<ExchangeRateSnapshot> {
  const response = await fetch(USD_CNY_RATE_URL, {
    headers: { Accept: 'application/json' },
    cache: 'no-cache',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`汇率服务返回 HTTP ${response.status}`)

  const value: unknown = await response.json()
  if (typeof value !== 'object' || value === null) throw new Error('汇率服务返回了无效数据')
  const record = value as Record<string, unknown>
  const date = record.date
  const rate = record.rate

  if (record.base !== 'USD' || record.quote !== 'CNY'
    || !isRateDate(date)
    || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error('汇率服务返回了不符合约定的数据')
  }

  return {
    usdToCny: rate,
    date,
    fetchedAt: Date.now(),
  }
}
