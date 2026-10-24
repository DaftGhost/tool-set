import { fireEvent, screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { draft, exampleOne, exampleTwo, storeAllCaches } from './fixtures'
import { mountApp } from './mountApp'
import { stubFetch } from './network'
import { fieldInput, scenarioCard } from './queries'

// The plot area in SVG units (see CostChart.tsx: plot = { left: 86, right: 890 }).
const PLOT_LEFT = 86
const PLOT_WIDTH = 890 - 86
const CHART_NAME = '总成本随缓存命中率变化的对比图'
const INTERSECTION_NAME = '方案 1 × 方案 2'
const CROSSING_LABEL = '方案 1 与 方案 2'
const PROMPT = '点选图上的交点，查看该参数下的方案明细。'

// jsdom has no SVG geometry. The stub maps client coordinates 1:1 onto SVG units.
function stubSvgGeometry() {
  Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
    configurable: true,
    value() {
      return {
        x: 0,
        y: 0,
        matrixTransform(this: { x: number; y: number }) {
          return { x: this.x, y: this.y }
        },
      }
    },
  })
  Object.defineProperty(SVGSVGElement.prototype, 'getScreenCTM', {
    configurable: true,
    value() {
      return { inverse() { return this } }
    },
  })
}

function removeSvgGeometry() {
  delete (SVGSVGElement.prototype as unknown as Record<string, unknown>).createSVGPoint
  delete (SVGSVGElement.prototype as unknown as Record<string, unknown>).getScreenCTM
}

const plotClientX = (fraction: number) => PLOT_LEFT + fraction * PLOT_WIDTH

function dispatchPointer(type: 'pointerdown' | 'pointermove', target: Element, clientX: number, buttons: number) {
  fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 100, buttons }))
}

const chart = () => screen.getByRole('group', { name: CHART_NAME })
const hitArea = () => chart().querySelector('rect') as SVGRectElement
const slider = () => screen.getByRole('slider', { name: /图表横轴位置/ }) as HTMLInputElement

beforeEach(() => {
  storeAllCaches([exampleOne(), exampleTwo()])
  stubFetch({})
  stubSvgGeometry()
})

afterEach(() => {
  removeSvgGeometry()
})

describe('R6 cost chart', () => {
  it('shows the axis and metric controls with the current choice pressed', async () => {
    const user = userEvent.setup()
    mountApp()

    const axis = screen.getByRole('group', { name: '横轴参数' })
    expect(within(axis).getByRole('button', { name: '缓存命中率' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(axis).getByRole('button', { name: '输入 Token' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(axis).getByRole('button', { name: '输出 / 输入比' })).toHaveAttribute('aria-pressed', 'false')
    const metric = screen.getByRole('group', { name: '纵轴成本' })
    expect(within(metric).getByRole('button', { name: '总成本' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(axis).getByRole('button', { name: '输入 Token' }))
    await user.click(within(metric).getByRole('button', { name: '输入' }))

    expect(within(axis).getByRole('button', { name: '输入 Token' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(axis).getByRole('button', { name: '缓存命中率' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(metric).getByRole('button', { name: '输入' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: '输入成本随输入 Token 数变化的对比图' })).toBeInTheDocument()
  })

  it('shows the cursor at 97% by default with the cheapest scenario there', () => {
    mountApp()

    expect(slider()).toHaveValue('970')
    expect(slider()).toHaveAccessibleName('图表横轴位置，当前 97%')
    expect(screen.getByText('当前 97%')).toBeInTheDocument()
    expect(screen.getByText('方案 2 更省')).toBeInTheDocument()
    expect(screen.getByLabelText('方案图例')).toHaveTextContent('方案 1 ¥13.755')
    expect(screen.getByLabelText('方案图例')).toHaveTextContent('方案 2 ¥11.94')
  })

  it('moves the cursor when the plot is pressed and clamps it to the plot area', async () => {
    mountApp()

    dispatchPointer('pointerdown', hitArea(), plotClientX(0.5), 1)
    await waitForValue('500')
    expect(slider()).toHaveAccessibleName('图表横轴位置，当前 50%')
    expect(screen.getByText('当前 50%')).toBeInTheDocument()

    dispatchPointer('pointerdown', hitArea(), -200, 1)
    await waitForValue('0')
    expect(slider()).toHaveAccessibleName('图表横轴位置，当前 0%')

    dispatchPointer('pointerdown', hitArea(), 5000, 1)
    await waitForValue('1000')
    expect(slider()).toHaveAccessibleName('图表横轴位置，当前 100%')
  })

  it('drags the cursor while a button is held and ignores moves with no button pressed', async () => {
    mountApp()
    dispatchPointer('pointerdown', hitArea(), plotClientX(0.25), 1)
    await waitForValue('250')

    dispatchPointer('pointermove', chart(), plotClientX(0.75), 0)
    await pause()
    expect(slider()).toHaveValue('250')

    dispatchPointer('pointermove', chart(), plotClientX(0.75), 1)
    await waitForValue('750')

    dispatchPointer('pointermove', chart(), 99999, 1)
    await waitForValue('1000')
  })

  it('shows each scenario cost at the intersection that was clicked', async () => {
    const user = userEvent.setup()
    mountApp()

    expect(screen.getByText(PROMPT)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: new RegExp(INTERSECTION_NAME) }))

    expect(screen.queryByText(PROMPT)).toBeNull()
    expect(screen.getByText(CROSSING_LABEL)).toBeInTheDocument()
    const summary = screen.getByText(CROSSING_LABEL).parentElement as HTMLElement
    expect(summary).toHaveTextContent('¥14.060177 · 总成本')
    expect(summary.parentElement).toHaveTextContent('缓存命中率95.93%')

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('方案 1100M95.9292%1%¥14.060177')
    expect(rows[1]).toHaveTextContent('方案 2100M95.9292%1%¥14.060177')
    expect(screen.getByRole('button', { name: new RegExp(INTERSECTION_NAME) })).toHaveAttribute('aria-pressed', 'true')
  })

  it('selects an intersection from its marker on the plot by click and by Enter', async () => {
    const user = userEvent.setup()
    mountApp()
    const marker = screen.getByRole('button', { name: /在 95\.93% 时成本相交，¥14\.060177/ })

    await user.click(marker)
    expect(screen.getByText(CROSSING_LABEL)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(INTERSECTION_NAME) })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '输出 / 输入比' }))
    await user.click(screen.getByRole('button', { name: '缓存命中率' }))
    expect(screen.queryByText(CROSSING_LABEL)).toBeNull()

    // The markers were removed while the axis showed no crossings, so query the recreated marker.
    screen.getByRole('button', { name: /在 95\.93% 时成本相交，¥14\.060177/ }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByText(CROSSING_LABEL)).toBeInTheDocument()
  })

  it('clears the selected intersection when the horizontal axis changes', async () => {
    const user = userEvent.setup()
    mountApp()
    await user.click(screen.getByRole('button', { name: new RegExp(INTERSECTION_NAME) }))
    expect(screen.getByText(CROSSING_LABEL)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '输出 / 输入比' }))
    expect(screen.queryByText(CROSSING_LABEL)).toBeNull()
    expect(screen.getByText('当前方案在这个参数范围内没有成本交叉点。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '缓存命中率' }))
    expect(screen.queryByText(CROSSING_LABEL)).toBeNull()
    expect(screen.getByText(PROMPT)).toBeInTheDocument()
  })

  it('clears the selected intersection when the vertical metric changes', async () => {
    const user = userEvent.setup()
    mountApp()
    await user.click(screen.getByRole('button', { name: new RegExp(INTERSECTION_NAME) }))
    expect(screen.getByText(CROSSING_LABEL)).toBeInTheDocument()

    // Output cost does not depend on the cache hit rate, so the output lines never cross.
    await user.click(screen.getByRole('button', { name: '输出' }))
    expect(screen.queryByText(CROSSING_LABEL)).toBeNull()
    expect(screen.getByText('当前方案在这个参数范围内没有成本交叉点。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '总成本' }))
    expect(screen.queryByText(CROSSING_LABEL)).toBeNull()
    expect(screen.getByText(PROMPT)).toBeInTheDocument()
  })

  it('shows the empty chart message when no scenario can be calculated', () => {
    storeAllCaches([draft('bad', '方案 1', { inputTokensM: '-1' })])
    mountApp()

    expect(screen.getByText('添加并完善至少一个有效方案，成本曲线会显示在这里。')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: CHART_NAME })).toBeNull()
    expect(scenarioCard('方案 1')).toHaveTextContent('参数待修正')
    expect(fieldInput('输入 Token')).toHaveValue('-1')
  })
})

function pause() {
  return new Promise((resolve) => {
    setTimeout(resolve, 20)
  })
}

// The UI may update the DOM asynchronously after a DOM event, so poll until the range input shows the value.
async function waitForValue(value: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (slider().value === value) return
    await pause()
  }
  expect(slider()).toHaveValue(value)
}
