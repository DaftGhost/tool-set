// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearHistory, historyKey, loadHistory, rememberPersona, saveHistory } from './personaHistory.ts'
import { snapshot } from '../test/fixtures.ts'
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('browser persona history', () => {
  it('retains twenty recent unique personas and stores snapshots with their original fields', () => {
    let entries = [] as ReturnType<typeof loadHistory>['entries']
    for (let index = 0; index < 21; index++) {
      const uuid = index.toString(16).padStart(32, '0')
      entries = rememberPersona(entries, { ...snapshot, recordId: uuid, fields: { ...snapshot.fields, uuid } }, index + 1)
    }
    entries = rememberPersona(entries, entries[5]!.snapshot, 30)
    expect(entries).toHaveLength(20)
    expect(entries[0]?.drawnAt).toBe(30)
    expect(saveHistory(entries)).toBe('')
    expect(loadHistory().entries).toEqual(entries)
    expect(loadHistory().entries[0]?.snapshot.fields.professional_persona).toBe(snapshot.fields.professional_persona)
  })

  it('keeps valid entries and reports damaged entries or a damaged envelope without throwing', () => {
    localStorage.setItem(historyKey, JSON.stringify({ schemaVersion: 1, entries: [{ snapshot, drawnAt: 1 }, { snapshot: { ...snapshot, source: { ...snapshot.source, url: 'javascript:alert(1)' } }, drawnAt: 2 }] }))
    expect(loadHistory().entries).toEqual([{ snapshot, drawnAt: 1 }])
    expect(loadHistory().error).not.toBe('')
    localStorage.setItem(historyKey, '{broken')
    expect(loadHistory().entries).toEqual([])
    expect(loadHistory().error).not.toBe('')
  })

  it('reports a blocked browser storage while preserving the rest of the tool', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    expect(loadHistory().entries).toEqual([])
    expect(loadHistory().error).not.toBe('')
  })

  it('keeps saved entries if clearing browser storage is rejected', () => {
    const entries = rememberPersona([], snapshot, 1)
    saveHistory(entries)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    expect(clearHistory()).not.toBe('')
    expect(loadHistory().entries).toEqual(entries)
  })
})
