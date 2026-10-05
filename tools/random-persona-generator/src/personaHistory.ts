import { objectValue, parseSnapshot } from './dataContract.ts'
import type { PersonaSnapshot } from './dataContract.ts'

export const historyKey = 'tool-set:random-persona-generator:history:v1'
export const historyLimit = 20
export interface HistoryEntry { snapshot: PersonaSnapshot; drawnAt: number }
export interface HistoryState { entries: HistoryEntry[]; error: string }

export function loadHistory(): HistoryState {
  try {
    const stored = localStorage.getItem(historyKey)
    if (!stored) return { entries: [], error: '' }
    const envelope = objectValue(JSON.parse(stored))
    if (envelope.schemaVersion !== 1 || !Array.isArray(envelope.entries)) throw new Error('Invalid history')
    const entries: HistoryEntry[] = []
    let error = ''
    for (const value of envelope.entries.slice(0, historyLimit)) {
      try {
        const entry = objectValue(value)
        if (typeof entry.drawnAt !== 'number' || !Number.isFinite(new Date(entry.drawnAt).getTime()) || entry.drawnAt <= 0) throw new Error('Invalid timestamp')
        entries.push({ snapshot: parseSnapshot(entry.snapshot), drawnAt: entry.drawnAt })
      } catch { error = '部分历史记录无法读取，已保留可用记录。' }
    }
    return { entries, error }
  } catch { return { entries: [], error: '本地历史记录无法读取；仍可抽取和复制人物。' } }
}

export function rememberPersona(entries: HistoryEntry[], snapshot: PersonaSnapshot, drawnAt = Date.now()): HistoryEntry[] {
  return [{ snapshot, drawnAt }, ...entries.filter(entry => entry.snapshot.recordId !== snapshot.recordId || entry.snapshot.datasetVersion !== snapshot.datasetVersion)].slice(0, historyLimit)
}

export function saveHistory(entries: HistoryEntry[]): string {
  try { localStorage.setItem(historyKey, JSON.stringify({ schemaVersion: 1, entries })); return '' }
  catch { return '历史记录未能保存，可能是浏览器禁止存储或空间不足；本次人物仍可查看和复制。' }
}

export function clearHistory(): string {
  try { localStorage.removeItem(historyKey); return '' }
  catch { return '历史记录未能清空，请检查浏览器的本地存储设置。' }
}
