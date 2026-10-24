import { useEffect, useRef, useState } from 'react'
import type { CurrencyCode, ExchangeRateSnapshot } from './domain/currency'
import { fetchLatestUsdCnyRate } from './services/exchangeRate'
import { loadCurrencyPreferences, saveCurrencyPreferences } from './storage/currencyStorage'

type RateStatus = 'loading' | 'current' | 'cached' | 'unavailable'

type Options = {
  // Called after a successful refresh, so the caller can reprice linked scenarios with the new rate.
  onRateRefreshed(rate: ExchangeRateSnapshot): void
}

export function useExchangeRate({ onRateRefreshed }: Options) {
  const [initial] = useState(() => {
    const preferences = loadCurrencyPreferences()
    return { currency: preferences?.currency ?? 'CNY', rate: preferences?.rate ?? null }
  })
  const [currency, setCurrencyState] = useState<CurrencyCode>(initial.currency)
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateSnapshot | null>(initial.rate)
  const [rateStatus, setRateStatus] = useState<RateStatus>(initial.rate ? 'cached' : 'loading')
  const [saveFailed, setSaveFailed] = useState(false)
  // Read by the async refresh, which may finish after the currency has changed.
  const currencyRef = useRef(currency)
  const requestInFlight = useRef(false)

  async function refreshRate() {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setRateStatus('loading')
    try {
      const latest = await fetchLatestUsdCnyRate()
      setExchangeRate(latest)
      setRateStatus('current')
      setSaveFailed(!saveCurrencyPreferences({ currency: currencyRef.current, rate: latest }))
      onRateRefreshed(latest)
    } catch {
      setRateStatus(exchangeRate ? 'cached' : 'unavailable')
    } finally {
      requestInFlight.current = false
    }
  }

  // Runs once on open when no rate is cached. StrictMode runs this effect twice in development; the in-flight flag absorbs the second call.
  useEffect(() => {
    if (!initial.rate) void refreshRate()
  }, [])

  // Saves only from the change handler and the refresh success path, never on render.
  function changeCurrency(next: CurrencyCode) {
    if (next === currencyRef.current) return
    currencyRef.current = next
    setCurrencyState(next)
    setSaveFailed(!saveCurrencyPreferences({ currency: next, rate: exchangeRate }))
  }

  return {
    currency,
    exchangeRate,
    rateStatus,
    saveFailed,
    changeCurrency,
    refreshRate,
  }
}
