import { useEffect, useState, type ReactNode } from 'react'
import { CatalogCards, CatalogSearch, loadCatalogData, type CatalogTool } from './catalog'

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; tools: CatalogTool[] }
  | { status: 'empty' }
  | { status: 'error' }

class ToolGlyph {
  static mark(slug: string): ReactNode {
    if (slug === 'llm-api-cost-calculator') return ToolGlyph.yen()
    if (slug === 'text-formatter') return ToolGlyph.page()
    if (slug === 'privacy-profile-generator') return ToolGlyph.shield()
    if (slug === 'random-persona-generator') return ToolGlyph.person()
    return ToolGlyph.square()
  }

  static yen() {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M7 5.5 12 12.2 17 5.5M12 12.2V19M8.2 13.4h7.6M8.2 16.2h7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  static page() {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
        <path fill="currentColor" fillRule="evenodd" d="M7 3.6h6.1L19 9.4V20.4H7V3.6Zm5.8 1.5v4.4H17.2l-4.4-4.4ZM9.2 12.2h5.6v1.5H9.2v-1.5Zm0 3h4v1.5h-4v-1.5Z" />
      </svg>
    )
  }

  static shield() {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
        <path fill="currentColor" d="M12 3.1 18.7 6v6.3c0 4.3-2.8 7.3-6.7 9-3.9-1.7-6.7-4.7-6.7-9V6L12 3.1Z" />
      </svg>
    )
  }

  static person() {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
        <path fill="currentColor" d="M12 4a3.4 3.4 0 1 1 0 6.8A3.4 3.4 0 0 1 12 4ZM6.3 19.6c.7-3.3 3-5 5.7-5s5 1.7 5.7 5c.1.6-.4 1.1-1 1.1H7.3c-.6 0-1.1-.5-1-1.1Z" />
      </svg>
    )
  }

  static square() {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none">
        <rect x="5" y="5" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
}

function ToolCard({ tool }: { tool: CatalogTool }) {
  const tags = CatalogCards.tagsFor(tool)
  return (
    <a className="flex h-full flex-col rounded-panel border border-line bg-surface p-4 text-inherit no-underline transition-colors hover:border-primary" href={tool.href}>
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-control shrink-0 place-items-center rounded-inset border border-primary-muted bg-primary-soft text-primary-deep">
          {ToolGlyph.mark(tool.slug)}
        </span>
        <span className="min-w-0">
          <h2 className="m-0 truncate text-heading text-ink">{tool.name}</h2>
          <span className="mt-1 block truncate text-ui text-muted" title={tool.summary}>{tool.summary}</span>
        </span>
      </span>
      <span className="mt-3 flex flex-wrap gap-2 border-t border-line-soft pt-3">
        {tags.map((tag) => (
          <span className="inline-flex items-center rounded-badge bg-primary-soft px-2 py-1 text-label text-ink" key={tag}>{tag}</span>
        ))}
      </span>
    </a>
  )
}

function App() {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [query, setQuery] = useState('')

  async function reloadCatalog() {
    setCatalog({ status: 'loading' })

    try {
      const tools = await loadCatalogData()
      setCatalog(tools.length === 0 ? { status: 'empty' } : { status: 'ready', tools })
    } catch {
      setCatalog({ status: 'error' })
    }
  }

  useEffect(() => {
    void reloadCatalog()
  }, [])

  const tools = catalog.status === 'ready' ? CatalogSearch.filter(catalog.tools, query) : []
  const noMatches = catalog.status === 'ready' && tools.length === 0

  return (
    <div className="flex min-h-screen flex-col">
      <header className="page-inset flex min-h-header items-center border-b border-line bg-surface/90 max-phone:min-h-header-phone">
        <a className="inline-flex items-center gap-2.5 text-brand text-ink no-underline max-phone:gap-2" href="./" aria-label="工具集首页">
          <span className="flex size-gutter items-end gap-1 rounded-control bg-primary-deep p-1" aria-hidden="true">
            <i className="block h-2 w-1 rounded-full bg-surface opacity-70" />
            <i className="block h-3 w-1 rounded-full bg-surface" />
            <i className="block h-2 w-1 rounded-full bg-surface opacity-85" />
          </span>
          <span>工具集</span>
        </a>
      </header>

      <main className="page-frame flex-1 pt-block pb-footer max-phone:pt-gutter max-phone:pb-block">
        <section aria-labelledby="page-title">
          <h1 id="page-title" className="m-0 text-display text-ink max-phone:text-display-phone">你想完成什么？</h1>
          <p className="mt-3 text-ui text-muted max-phone:mt-2 max-phone:text-label">按用途选择工具，打开后直接开始。</p>
          <label className="mt-4 grid gap-1.5 text-ui font-bold text-muted" htmlFor="tool-search">
            <span>搜索工具</span>
            <input
              id="tool-search"
              className="min-h-control rounded-control border border-line bg-surface px-3 font-medium text-ink"
              type="search"
              placeholder="名称、说明或分类"
              value={query}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </section>

        <section className="mt-gutter max-phone:mt-5" aria-label="工具列表">
          {catalog.status === 'ready' && tools.length > 0 && (
            <div className="catalog-grid">
              {tools.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}
            </div>
          )}

          {noMatches && (
            <p className="m-0 text-body text-muted" role="status" aria-live="polite">没有匹配的工具。</p>
          )}
          {catalog.status === 'loading' && (
            <p className="m-0 text-body text-muted empty:hidden" role="status" aria-live="polite">正在加载工具列表…</p>
          )}
          {catalog.status === 'empty' && (
            <p className="m-0 text-body text-muted empty:hidden" role="status" aria-live="polite">当前还没有可用工具。</p>
          )}
          {catalog.status === 'error' && (
            <>
              <p className="m-0 text-body text-muted empty:hidden" role="status" aria-live="polite">工具列表加载失败，请重试。</p>
              <button className="mt-3 inline-flex min-h-control cursor-pointer items-center rounded-control border border-line bg-primary-soft px-3 text-label font-bold text-primary-deep transition-colors hover:bg-primary-soft-hover" type="button" onClick={() => void reloadCatalog()}>
                重新加载
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
