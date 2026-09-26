export async function loadCatalog({
  documentRef = document,
  fetchImpl = (url) => fetch(url),
} = {}) {
  const groups = documentRef.getElementById('tool-groups')
  const message = documentRef.getElementById('catalog-message')
  const retry = documentRef.getElementById('catalog-retry')

  async function load() {
    groups.replaceChildren()
    retry.hidden = true
    message.textContent = '正在加载工具列表…'

    try {
      const response = await fetchImpl('./tools.json')
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`)

      const manifest = await response.json()
      if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.tools)) {
        throw new Error('Invalid tools manifest')
      }

      if (manifest.tools.length === 0) {
        message.textContent = '当前还没有可用工具。'
        return
      }

      for (const tool of manifest.tools) {
        if (!tool || typeof tool.category !== 'string' || typeof tool.actionLabel !== 'string' || typeof tool.name !== 'string' || typeof tool.summary !== 'string' || typeof tool.href !== 'string') {
          throw new Error('Invalid tool entry')
        }

        let group = [...groups.children].find((child) => child.dataset.category === tool.category)
        if (!group) {
          group = documentRef.createElement('section')
          group.className = 'function-group'
          group.dataset.category = tool.category

          const title = documentRef.createElement('h2')
          title.className = 'function-title'
          title.textContent = tool.category

          const list = documentRef.createElement('div')
          list.className = 'tool-list'
          group.append(title, list)
          groups.append(group)
        }

        const list = group.children[1]
        const link = documentRef.createElement('a')
        link.className = 'tool-card'
        link.href = tool.href

        const details = documentRef.createElement('div')
        details.className = 'tool-copy'

        const name = documentRef.createElement('h3')
        name.textContent = tool.name

        const summary = documentRef.createElement('p')
        summary.textContent = tool.summary

        const action = documentRef.createElement('span')
        action.className = 'tool-action'
        action.textContent = tool.actionLabel

        details.append(name, summary, action)
        link.append(details)

        if (tool.category === 'API 费用估算') {
          const formula = documentRef.createElement('div')
          formula.className = 'cost-formula'
          formula.setAttribute('role', 'img')
          formula.setAttribute('aria-label', '单次调用总额由缓存输入费用、未缓存输入费用和输出费用相加得出')

          for (const label of ['缓存输入费用', '未缓存输入费用', '输出费用']) {
            const term = documentRef.createElement('div')
            term.className = 'formula-term'

            const termLabel = documentRef.createElement('span')
            termLabel.textContent = label

            const operator = documentRef.createElement('span')
            operator.className = 'formula-operator'
            operator.textContent = '+'

            term.append(termLabel, operator)
            formula.append(term)
          }

          const result = documentRef.createElement('div')
          result.className = 'formula-result'

          const equals = documentRef.createElement('span')
          equals.className = 'formula-equals'
          equals.textContent = '='

          const total = documentRef.createElement('span')
          total.textContent = '单次调用总额'

          result.append(equals, total)
          formula.append(result)
          link.append(formula)
        }

        list.append(link)
      }

      message.textContent = ''
    } catch {
      groups.replaceChildren()
      message.textContent = '工具列表加载失败，请重试。'
      retry.hidden = false
    }
  }

  retry.addEventListener('click', load)
  await load()
}

if (typeof document !== 'undefined') {
  void loadCatalog()
}
