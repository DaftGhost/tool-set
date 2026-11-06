export interface CatalogTool {
  slug: string
  category: string
  actionLabel: string
  name: string
  summary: string
  href: string
}

interface CatalogResponse {
  ok: boolean
  status?: number
  json: () => Promise<unknown>
}

export type CatalogFetcher = (url: string) => Promise<CatalogResponse>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCatalogTool(value: unknown): value is CatalogTool {
  return isRecord(value)
    && typeof value.slug === 'string'
    && typeof value.category === 'string'
    && typeof value.actionLabel === 'string'
    && typeof value.name === 'string'
    && typeof value.summary === 'string'
    && typeof value.href === 'string'
}

function parseCatalog(value: unknown): CatalogTool[] {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.tools)) {
    throw new Error('Invalid tools manifest')
  }

  if (!value.tools.every(isCatalogTool)) throw new Error('Invalid tool entry')
  return value.tools
}

export async function loadCatalogData(
  fetchImpl: CatalogFetcher = (url) => fetch(url),
): Promise<CatalogTool[]> {
  const response = await fetchImpl('./tools.json')
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
  return parseCatalog(await response.json())
}

interface CatalogCardEntry {
  glyph: CatalogGlyph
  tags: readonly string[]
}

export class CatalogCards {
  static glyphs = ['yen', 'page', 'shield', 'person'] as const

  static entries: Record<string, CatalogCardEntry> = {
    'llm-api-cost-calculator': { glyph: 'yen', tags: ['多方案对比', 'USD / CNY', '图表'] },
    'text-formatter': { glyph: 'page', tags: ['JSON', 'XML', 'SQL'] },
    'privacy-profile-generator': { glyph: 'shield', tags: ['隐私保护', '本地生成'] },
    'random-persona-generator': { glyph: 'person', tags: ['人物档案', '一键复制', '本地历史'] },
  }

  static glyphFor(tool: CatalogTool): CatalogGlyph | 'square' {
    return CatalogCards.entries[tool.slug]?.glyph ?? 'square'
  }

  static tagsFor(tool: CatalogTool): string[] {
    const tags = CatalogCards.entries[tool.slug]?.tags
    return tags ? [...tags] : [tool.category, tool.actionLabel]
  }
}

export type CatalogGlyph = (typeof CatalogCards.glyphs)[number]

export class CatalogSearch {
  static normalize(query: string): string {
    return query.trim().toLocaleLowerCase()
  }

  static matches(tool: CatalogTool, query: string): boolean {
    const needle = CatalogSearch.normalize(query)
    if (needle === '') return true
    const haystack = `${tool.name}\n${tool.summary}\n${tool.category}\n${CatalogCards.tagsFor(tool).join('\n')}`.toLocaleLowerCase()
    return haystack.includes(needle)
  }

  static filter(tools: CatalogTool[], query: string): CatalogTool[] {
    return tools.filter((tool) => CatalogSearch.matches(tool, query))
  }
}
