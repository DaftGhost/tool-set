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
      className="cost-formula"
      role="img"
      aria-label="单次调用总额由缓存输入费用、未缓存输入费用和输出费用相加得出"
    >
      {['缓存输入费用', '未缓存输入费用', '输出费用'].map((label) => (
        <div className="formula-term" key={label}>
          <span>{label}</span>
          <span className="formula-operator">+</span>
        </div>
      ))}
      <div className="formula-result">
        <span className="formula-equals">=</span>
        <span>单次调用总额</span>
      </div>
    </div>
  )
}

function ToolCard({ tool }: { tool: CatalogTool }) {
  return (
    <a className="tool-card" href={tool.href}>
      <div className="tool-copy">
        <h3>{tool.name}</h3>
        <p>{tool.summary}</p>
        <span className="tool-action">{tool.actionLabel}</span>
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
    <div className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="./" aria-label="工具集首页">
          <span className="wordmark-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>工具集</span>
        </a>
      </header>

      <main className="content">
        <section className="intro" aria-labelledby="page-title">
          <h1 id="page-title">你想完成什么？</h1>
          <p>按用途选择工具，打开后直接开始。</p>
        </section>

        <section className="tool-directory" aria-label="按用途选择工具">
          {catalog.status === 'ready' && (
            <div className="tool-groups">
              {groups.map((group) => (
                <section className="function-group" key={group.category}>
                  <h2 className="function-title">{group.category}</h2>
                  <div className="tool-list">
                    {group.tools.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}
                  </div>
                </section>
              ))}
            </div>
          )}

          {catalog.status === 'loading' && (
            <p className="catalog-message" role="status" aria-live="polite">正在加载工具列表…</p>
          )}
          {catalog.status === 'empty' && (
            <p className="catalog-message" role="status" aria-live="polite">当前还没有可用工具。</p>
          )}
          {catalog.status === 'error' && (
            <>
              <p className="catalog-message" role="status" aria-live="polite">工具列表加载失败，请重试。</p>
              <button className="retry-button" type="button" onClick={() => void reloadCatalog()}>
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
