import { useEffect, useReducer, useState } from 'react'
import type { DraftField, ModelPriceSource, ScenarioDraft } from './domain/cost'
import { ContextPricing, CacheTtlPricing } from './domain/pricing'
import { MAX_CUSTOM_TTLS, exampleScenarios, normalizeModelPriceSource } from './domain/scenarios'
import { loadScenarioState, saveScenarioState } from './storage/scenarioStorage'
import type { LoadResult } from './storage/scenarioStorage'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

const SAVE_FAILED_NOTICE = '方案未能保存，离开页面后这些修改可能丢失。请检查可用空间后重试。'
const SAVE_DELAY_MS = 350

export type ScenarioState = Readonly<{
  scenarios: ScenarioDraft[]
  activeId: string
  // Incremented by every action that changes the scenarios. 0 means the user has not edited since the page opened, so nothing is saved.
  revision: number
}>

export type ScenarioAction =
  | { type: 'setField'; field: DraftField; value: string; usdToCny: number }
  | { type: 'setName'; value: string }
  | { type: 'link'; source: ModelPriceSource; usdToCny: number }
  | { type: 'unlink' }
  | { type: 'setContextTier'; value: string; usdToCny: number }
  | { type: 'setCacheTtl'; id: string; usdToCny: number }
  | { type: 'addCustomTtl' }
  | { type: 'renameCustomTtl'; id: string; label: string }
  | { type: 'removeCustomTtl'; id: string; usdToCny: number }
  | { type: 'add'; scenario: ScenarioDraft }
  | { type: 'remove'; id: string }
  | { type: 'select'; id: string }
  | { type: 'reprice'; usdToCny: number }

export function activeIndexOf(scenarios: readonly ScenarioDraft[], activeId: string): number {
  const index = scenarios.findIndex(({ id }) => id === activeId)
  return index >= 0 ? index : 0
}

function compactPrice(value: number): string {
  return Number(value.toPrecision(15)).toString()
}

function applyCatalogPrices(scenario: ScenarioDraft, source: ModelPriceSource, usdToCny: number): ScenarioDraft {
  const bracket = ContextPricing.bracket(source, scenario.contextTier, ContextPricing.promptTokens(scenario.inputTokensM))
  const writeUsd = CacheTtlPricing.writeUsd(source.providerId, bracket, scenario.cacheTtlId)
  return {
    ...scenario,
    cachedPrice: compactPrice(bracket.cacheReadUsdPerMillion * usdToCny),
    uncachedPrice: compactPrice(bracket.inputUsdPerMillion * usdToCny),
    outputPrice: compactPrice(bracket.outputUsdPerMillion * usdToCny),
    cacheWritePrice: writeUsd === null ? scenario.cacheWritePrice : compactPrice(writeUsd * usdToCny),
  }
}

function pricesMatch(left: ScenarioDraft, right: ScenarioDraft): boolean {
  return left.cachedPrice === right.cachedPrice
    && left.cacheWritePrice === right.cacheWritePrice
    && left.uncachedPrice === right.uncachedPrice
    && left.outputPrice === right.outputPrice
}

function nextCustomLabel(scenario: ScenarioDraft): string {
  const used = new Set(scenario.customTtls.map((row) => row.label))
  if (!used.has('自定义')) return '自定义'
  let number = 2
  while (used.has(`自定义 ${number}`)) number += 1
  return `自定义 ${number}`
}

function nextCustomId(): string {
  return `ttl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function replaceAt(scenarios: ScenarioDraft[], index: number, next: ScenarioDraft): ScenarioDraft[] {
  return scenarios.map((scenario, position) => position === index ? next : scenario)
}

// Returns the same state object when nothing changes, so a no-op action does not schedule a save.
export function scenarioReducer(state: ScenarioState, action: ScenarioAction): ScenarioState {
  const index = activeIndexOf(state.scenarios, state.activeId)
  const active = state.scenarios[index]
  const changed = (patch: Partial<ScenarioState>): ScenarioState => ({ ...state, ...patch, revision: state.revision + 1 })
  switch (action.type) {
    case 'setField': {
      if (active[action.field] === action.value) return state
      let next: ScenarioDraft = { ...active, [action.field]: action.value }
      if (action.field === 'cacheWritePrice') {
        next = {
          ...next,
          customTtls: next.customTtls.map((row) => row.id === next.cacheTtlId ? { ...row, writePrice: action.value } : row),
        }
      }
      if (action.field === 'inputTokensM' && next.modelPriceSource && next.contextTier === 'auto') {
        const priced = applyCatalogPrices(next, next.modelPriceSource, action.usdToCny)
        if (!pricesMatch(priced, next)) next = priced
      }
      return changed({ scenarios: replaceAt(state.scenarios, index, next) })
    }
    case 'setName': {
      const name = action.value.slice(0, 32)
      if (active.name === name) return state
      return changed({ scenarios: replaceAt(state.scenarios, index, { ...active, name }) })
    }
    case 'link': {
      const source = normalizeModelPriceSource(action.source)
      const bracket = ContextPricing.bracket(source, 'auto', ContextPricing.promptTokens(active.inputTokensM))
      const linked: ScenarioDraft = {
        ...active,
        modelPriceSource: source,
        name: `${source.providerName} · ${source.modelName}`.slice(0, 32),
        contextTier: 'auto',
        cacheTtlId: 'catalog',
        cacheWritePercent: bracket.cacheWriteUsdPerMillion === 0 ? '0' : active.cacheWritePercent,
      }
      const next = applyCatalogPrices(linked, source, action.usdToCny)
      return changed({ scenarios: replaceAt(state.scenarios, index, next) })
    }
    case 'setContextTier': {
      if (active.contextTier === action.value) return state
      const next = { ...active, contextTier: action.value }
      const priced = next.modelPriceSource ? applyCatalogPrices(next, next.modelPriceSource, action.usdToCny) : next
      return changed({ scenarios: replaceAt(state.scenarios, index, priced) })
    }
    case 'setCacheTtl': {
      if (active.cacheTtlId === action.id) return state
      const custom = active.customTtls.find((row) => row.id === action.id)
      const next: ScenarioDraft = {
        ...active,
        cacheTtlId: action.id,
        cacheWritePrice: custom ? custom.writePrice : active.cacheWritePrice,
      }
      const priced = next.modelPriceSource && !custom
        ? applyCatalogPrices(next, next.modelPriceSource, action.usdToCny)
        : next
      return changed({ scenarios: replaceAt(state.scenarios, index, priced) })
    }
    case 'addCustomTtl': {
      if (active.customTtls.length >= MAX_CUSTOM_TTLS) return state
      const row = { id: nextCustomId(), label: nextCustomLabel(active), writePrice: active.cacheWritePrice }
      const next = { ...active, customTtls: [...active.customTtls, row], cacheTtlId: row.id }
      return changed({ scenarios: replaceAt(state.scenarios, index, next) })
    }
    case 'renameCustomTtl': {
      const label = action.label.slice(0, 32)
      const next = {
        ...active,
        customTtls: active.customTtls.map((row) => row.id === action.id ? { ...row, label } : row),
      }
      const changedRow = active.customTtls.some((row) => row.id === action.id && row.label !== label)
      if (!changedRow) return state
      return changed({ scenarios: replaceAt(state.scenarios, index, next) })
    }
    case 'removeCustomTtl': {
      if (!active.customTtls.some((row) => row.id === action.id)) return state
      const next: ScenarioDraft = {
        ...active,
        customTtls: active.customTtls.filter((row) => row.id !== action.id),
        cacheTtlId: active.cacheTtlId === action.id ? 'catalog' : active.cacheTtlId,
      }
      const priced = next.modelPriceSource && next.cacheTtlId === 'catalog'
        ? applyCatalogPrices(next, next.modelPriceSource, action.usdToCny)
        : next
      return changed({ scenarios: replaceAt(state.scenarios, index, priced) })
    }
    case 'unlink': {
      if (!active.modelPriceSource) return state
      const next = { ...active }
      delete next.modelPriceSource
      return changed({ scenarios: replaceAt(state.scenarios, index, next) })
    }
    case 'add':
      return changed({ scenarios: [...state.scenarios, action.scenario], activeId: action.scenario.id })
    case 'remove': {
      if (state.scenarios.length <= 1) return state
      const removedIndex = state.scenarios.findIndex(({ id }) => id === action.id)
      if (removedIndex < 0) return state
      const nextActive = action.id === state.activeId
        ? state.scenarios[removedIndex === 0 ? 1 : removedIndex - 1]
        : null
      return changed({
        scenarios: state.scenarios.filter(({ id }) => id !== action.id),
        activeId: nextActive ? nextActive.id : state.activeId,
      })
    }
    case 'select':
      if (action.id === state.activeId) return state
      return changed({ activeId: action.id })
    case 'reprice': {
      let differs = false
      const scenarios = state.scenarios.map((scenario) => {
        if (!scenario.modelPriceSource) return scenario
        const next = applyCatalogPrices(scenario, scenario.modelPriceSource, action.usdToCny)
        if (pricesMatch(next, scenario)) return scenario
        differs = true
        return next
      })
      return differs ? changed({ scenarios }) : state
    }
  }
}

function initialScenarioState(loaded: LoadResult): ScenarioState {
  if (loaded.status === 'loaded') {
    return {
      scenarios: loaded.state.scenarios.map((scenario) => ({ ...scenario })),
      activeId: loaded.state.activeId,
      revision: 0,
    }
  }
  const scenarios = exampleScenarios.map((scenario) => ({ ...scenario }))
  return { scenarios, activeId: scenarios[0].id, revision: 0 }
}

export function useScenarioState() {
  const [loaded] = useState<LoadResult>(loadScenarioState)
  const [state, dispatch] = useReducer(scenarioReducer, loaded, initialScenarioState)
  const [saveResult, setSaveResult] = useState<{ revision: number; saved: boolean } | null>(null)
  const [saveNotice, setSaveNotice] = useState(() => {
    if (loaded.status === 'invalid') return '上次的方案无法读取，已载入示例方案。修改并保存后，可以继续使用新方案。'
    if (loaded.status === 'unavailable') return '无法保存方案；离开页面后，当前修改可能丢失。'
    return ''
  })

  // Derived during render, so "正在保存" appears in the same render as the edit rather than after an effect runs.
  const saveStatus: SaveStatus = state.revision === 0
    ? 'idle'
    : saveResult?.revision !== state.revision
      ? 'saving'
      : saveResult.saved ? 'saved' : 'failed'

  // Runs only after an edit (revision > 0). It is cleared on every later edit and on unmount.
  useEffect(() => {
    if (state.revision === 0) return
    const timer = window.setTimeout(() => {
      const saved = saveScenarioState({ scenarios: state.scenarios, activeId: state.activeId })
      setSaveResult({ revision: state.revision, saved })
      setSaveNotice(saved ? '' : SAVE_FAILED_NOTICE)
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [state])

  return { state, dispatch, saveStatus, saveNotice, setSaveNotice, loadStatus: loaded.status }
}
