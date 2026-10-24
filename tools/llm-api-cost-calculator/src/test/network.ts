import { vi } from 'vitest'
import { CATALOG_URL, RATE_URL } from './fixtures'

export type Route = () => Promise<Response>

export function jsonRoute(body: unknown, status = 200): Route {
  return () => Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

export function networkErrorRoute(): Route {
  return () => Promise.reject(new TypeError('network unavailable'))
}

export function rateBody(rate: number, date = '2026-10-23') {
  return { base: 'USD', quote: 'CNY', date, rate }
}

export type FetchStub = ReturnType<typeof stubFetch>

// Replaces the global fetch. Requests to unknown URLs reject, so a stray request fails loudly.
export function stubFetch(routes: { rate?: Route; catalog?: Route }) {
  const mock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    const route = url === RATE_URL ? routes.rate : url === CATALOG_URL ? routes.catalog : undefined
    if (!route) return Promise.reject(new Error(`Unexpected request: ${url}`))
    return route()
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export function requestCount(stub: FetchStub, url: string): number {
  return stub.mock.calls.filter(([input]) => String(input) === url).length
}

export function deferredRoute(body: unknown): { route: Route; resolve(): void } {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    route: () => gate.then(() => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })),
    resolve: () => release(),
  }
}
