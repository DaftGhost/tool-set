// DOM-only lookups shared by the characterization tests.
import { screen, within } from '@testing-library/dom'

export function scenarioCard(name: string): HTMLElement {
  const card = screen.getAllByRole('article').find((article) => within(article).queryByText(name, { exact: true }))
  if (!card) throw new Error(`No scenario card named "${name}"`)
  return card
}

// The card's selection button is the only button in the card with aria-pressed.
export function scenarioMainButton(name: string): HTMLElement {
  const button = within(scenarioCard(name)).getAllByRole('button').find((element) => element.hasAttribute('aria-pressed'))
  if (!button) throw new Error(`No selection button in scenario card "${name}"`)
  return button
}

export function summaryPanel(): HTMLElement {
  return screen.getByRole('region', { name: '成本拆分' })
}

// Text of one cost line in the 成本拆分 panel, e.g. "输入成本100M tokens¥12.355".
export function costLineText(title: string): string | null | undefined {
  return within(summaryPanel()).getByText(title).parentElement?.parentElement?.textContent
}

export function fieldInput(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement
}
