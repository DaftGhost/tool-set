import { describe, expect, it } from 'vitest'
import { FormatOptionsModel, SchemeCatalog, type FormatScheme } from '../domain/formatModel'
import { SchemeRepository } from './schemeRepository'

class MemoryStorage implements Storage {
  #items = new Map<string, string>()

  get length(): number {
    return this.#items.size
  }

  clear(): void {
    this.#items.clear()
  }

  getItem(key: string): string | null {
    return this.#items.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.#items.delete(key)
  }

  setItem(key: string, value: string): void {
    this.#items.set(key, value)
  }
}

const custom: FormatScheme = {
  id: 'custom-json-tight',
  name: '紧凑 JSON',
  kind: 'json',
  builtin: false,
  options: { ...FormatOptionsModel.create(), compress: true },
}

describe('SchemeRepository', () => {
  it('round-trips custom schemes and the last scheme for each type', () => {
    const storage = new MemoryStorage()
    const repository = new SchemeRepository(storage)
    repository.save({
      customSchemes: [custom],
      lastSchemeIdByKind: { json: custom.id, sql: 'builtin-sql' },
    })

    const loaded = new SchemeRepository(storage).load()
    expect(loaded.customSchemes).toEqual([custom])
    expect(loaded.lastSchemeIdByKind).toEqual({ json: custom.id, sql: 'builtin-sql' })
    expect(SchemeCatalog.selection(loaded).json).toBe(custom.id)
    expect(SchemeCatalog.selection(loaded).xml).toBe('builtin-xml')
  })

  it('drops corrupt records and falls back to built-in schemes', () => {
    const storage = new MemoryStorage()
    storage.setItem(SchemeRepository.storageKey, '{"customSchemes":[{"id":"builtin-json","name":"坏","builtin":true}],"lastSchemeIdByKind":{"json":"missing"}}')
    const loaded = new SchemeRepository(storage).load()
    expect(loaded.customSchemes).toEqual([])
    expect(loaded.lastSchemeIdByKind).toEqual({})
    expect(SchemeCatalog.selection(loaded)).toEqual({
      json: 'builtin-json',
      xml: 'builtin-xml',
      sql: 'builtin-sql',
    })
  })

  it('returns an empty snapshot when storage does not contain JSON', () => {
    const storage = new MemoryStorage()
    storage.setItem(SchemeRepository.storageKey, '{')
    expect(new SchemeRepository(storage).load()).toEqual({ customSchemes: [], lastSchemeIdByKind: {} })
  })
})
