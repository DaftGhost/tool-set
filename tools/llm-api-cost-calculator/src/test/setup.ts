import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { unmountAllApps } from './mountApp'

afterEach(() => {
  unmountAllApps()
  window.localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
