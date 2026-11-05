export interface CatalogTool {
  slug: string
  category: string
  actionLabel: string
  name: string
  summary: string
  href: string
}

export interface CatalogGroup {
  category: string
  tools: CatalogTool[]
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

export function groupCatalogTools(tools: CatalogTool[]): CatalogGroup[] {
  const groups = new Map<string, CatalogTool[]>()

  for (const tool of tools) {
    const group = groups.get(tool.category)
    if (group) group.push(tool)
    else groups.set(tool.category, [tool])
  }

  return [...groups].map(([category, groupedTools]) => ({ category, tools: groupedTools }))
}

export class CatalogCards {
  static tags: Record<string, readonly string[]> = {
    'llm-api-cost-calculator': ['多方案对比', 'USD / CNY', '图表'],
    'text-formatter': ['JSON', 'XML', 'SQL'],
    'privacy-profile-generator': ['隐私保护', '本地生成'],
    'random-persona-generator': ['人物档案', '一键复制', '本地历史'],
  }

  static tagsFor(tool: CatalogTool): string[] {
    const known = CatalogCards.tags[tool.slug]
    return known ? [...known] : [tool.category, tool.actionLabel]
  }
}

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
