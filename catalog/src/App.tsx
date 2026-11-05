import { useEffect, useState } from 'react'
import { CatalogSearch, groupCatalogTools, loadCatalogData, type CatalogTool } from './catalog'

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; tools: CatalogTool[] }
  | { status: 'empty' }
  | { status: 'error' }

function ToolChip({ tool }: { tool: CatalogTool }) {
  return (
    <a
      className="catalog-chip rounded-control border border-line bg-surface px-3 py-1.5 text-inherit no-underline transition-colors hover:border-primary hover:bg-primary-soft"
      href={tool.href}
      title={tool.summary}
    >
      <span className="text-ui font-bold text-ink">{tool.name}</span>
      <span className="line-clamp-2 text-label text-muted">{tool.summary}</span>
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

  const groups = catalog.status === 'ready' ? groupCatalogTools(CatalogSearch.filter(catalog.tools, query)) : []
  const noMatches = catalog.status === 'ready' && groups.length === 0

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
          <label className="mt-4 grid max-w-summary gap-1.5 text-ui font-bold text-muted" htmlFor="tool-search">
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

        <section className="mt-gutter max-phone:mt-5" aria-label="按用途选择工具">
          {catalog.status === 'ready' && groups.length > 0 && (
            <div className="grid gap-section max-phone:gap-3">
              {groups.map((group) => (
                <section key={group.category}>
                  <h2 className="m-0 mb-2 text-section text-ink">{group.category}</h2>
                  <div className="catalog-chip-row">
                    {group.tools.map((tool) => <ToolChip key={tool.slug} tool={tool} />)}
                  </div>
                </section>
              ))}
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
