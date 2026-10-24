// The only test helper that knows the UI framework. Replace this file (and nothing else) when the UI changes.
import { createElement, StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { App } from '../App'

let activeUnmounts: Array<() => void> = []

export function mountApp(): { container: HTMLElement; unmount(): void } {
  const container = document.createElement('div')
  container.id = 'app'
  document.body.append(container)
  const root = createRoot(container)
  // flushSync commits the first render synchronously, so tests can query the DOM right after mounting.
  flushSync(() => {
    root.render(createElement(StrictMode, null, createElement(App)))
  })

  let mounted = true
  const unmount = () => {
    if (!mounted) return
    mounted = false
    root.unmount()
    container.remove()
  }
  activeUnmounts.push(unmount)
  return { container, unmount }
}

export function unmountAllApps(): void {
  for (const unmount of activeUnmounts.splice(0)) unmount()
}
