import { useEffect, useState } from 'react'
import { groupCatalogTools, loadCatalogData, type CatalogTool } from './catalog'

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; tools: CatalogTool[] }
  | { status: 'empty' }
  | { status: 'error' }

function CostFormula() {
  return (
    <div
      className="grid content-center gap-2 bg-primary-deep p-panel text-surface max-phone:gap-1.5 max-phone:px-4 max-phone:py-5"
      role="img"
      aria-label="单次调用总额由缓存输入费用、未缓存输入费用和输出费用相加得出"
    >
      {['缓存输入费用', '未缓存输入费用', '输出费用'].map((label) => (
        <div className="flex min-h-gutter items-center justify-between" key={label}>
          <span className="text-label text-on-deep-muted">{label}</span>
          <span className="w-5 shrink-0 text-center font-mono text-symbol text-brass-soft">+</span>
        </div>
      ))}
      <div className="mt-1.5 flex items-center gap-3 border-t border-surface/25 pt-3.5 text-ui font-bold">
        <span className="font-mono text-symbol text-brass-soft">=</span>
        <span>单次调用总额</span>
      </div>
    </div>
  )
}

function ToolCard({ tool }: { tool: CatalogTool }) {
  return (
    <a className="catalog-card group overflow-hidden rounded-panel border border-line bg-surface text-inherit no-underline shadow-panel transition-colors hover:border-primary" href={tool.href}>
      <div className="flex flex-col items-start justify-center p-panel only:col-span-full max-phone:px-4 max-phone:py-5">
        <h3 className="m-0 text-title text-ink">{tool.name}</h3>
        <p className="mt-2 max-w-summary text-ui text-muted max-phone:text-label">{tool.summary}</p>
        <span className="mt-4 inline-flex min-h-control items-center rounded-control bg-primary-soft px-3 text-label font-bold text-primary-deep transition-colors group-hover:bg-primary-soft-hover max-phone:px-2.5 max-phone:text-meta">{tool.actionLabel}</span>
      </div>
      {tool.category === 'API 费用估算' && <CostFormula />}
    </a>
  )
}

function App() {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })

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

  const groups = catalog.status === 'ready' ? groupCatalogTools(catalog.tools) : []

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
        </section>

        <section className="mt-gutter max-phone:mt-5" aria-label="按用途选择工具">
          {catalog.status === 'ready' && (
            <div className="grid gap-panel max-phone:gap-section">
              {groups.map((group) => (
                <section key={group.category}>
                  <h2 className="m-0 mb-3 text-section text-ink">{group.category}</h2>
                  <div className="grid gap-section">
                    {group.tools.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}
                  </div>
                </section>
              ))}
            </div>
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
