import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadCatalog } from '../catalog/catalog.js'

class TestElement {
  constructor(tagName = 'div') {
    this.tagName = tagName
    this.children = []
    this.dataset = {}
    this.listeners = new Map()
    this.textContent = ''
    this.hidden = false
  }

  append(...children) {
    this.children.push(...children)
  }

  replaceChildren(...children) {
    this.children = children
  }

  setAttribute(name, value) {
    this[name] = value
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener)
  }
}

function createDocument() {
  const elements = new Map([
    ['tool-groups', new TestElement()],
    ['catalog-message', new TestElement('p')],
    ['catalog-retry', new TestElement('button')],
  ])

  return {
    getElementById: (id) => elements.get(id),
    createElement: (tagName) => new TestElement(tagName),
    elements,
  }
}

test('loads generated tool entries as text and links to their generated relative paths', async () => {
  const documentRef = createDocument()
  const tools = [
    { slug: 'first-tool', category: 'API 费用估算', actionLabel: '开始测算', name: '<b>First tool</b>', summary: '<img src=x>', href: './tools/first-tool/' },
    { slug: 'second-tool', category: 'API 费用估算', actionLabel: '开始测算', name: 'Second tool', summary: 'A second tool.', href: './tools/second-tool/' },
    { slug: 'writing-tool', category: '文本处理', actionLabel: '编辑文本', name: 'Writing Tool', summary: 'Edit text.', href: './tools/writing-tool/' },
  ]

  await loadCatalog({
    documentRef,
    fetchImpl: async (url) => {
      assert.equal(url, './tools.json')
      return { ok: true, json: async () => ({ schemaVersion: 1, tools }) }
    },
  })

  const groups = documentRef.elements.get('tool-groups').children
  assert.equal(groups.length, 2)
  assert.equal(groups[0].children[0].textContent, 'API 费用估算')
  assert.equal(groups[0].children[1].children.length, 2)
  assert.equal(groups[0].children[1].children[0].href, './tools/first-tool/')
  assert.equal(groups[0].children[1].children[0].children[0].children[0].textContent, '<b>First tool</b>')
  assert.equal(groups[0].children[1].children[0].children[0].children[1].textContent, '<img src=x>')
  assert.equal(groups[0].children[1].children[0].children[0].children[2].textContent, '开始测算')
  assert.equal(groups[0].children[1].children[0].children[1].role, 'img')
  assert.equal(groups[0].children[1].children[0].children[1]['aria-label'], '单次调用总额由缓存输入费用、未缓存输入费用和输出费用相加得出')
  assert.equal(groups[0].children[1].children[1].href, './tools/second-tool/')
  assert.equal(groups[1].children[0].textContent, '文本处理')
  assert.equal(documentRef.elements.get('catalog-message').textContent, '')
})

test('shows a retry action after a catalog request fails', async () => {
  const documentRef = createDocument()
  let requests = 0
  const fetchImpl = async () => {
    requests += 1
    if (requests === 1) return { ok: false, status: 503 }
    return {
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        tools: [{ slug: 'ready-tool', category: 'Utilities', actionLabel: 'Open', name: 'Ready Tool', summary: 'Available now.', href: './tools/ready-tool/' }],
      }),
    }
  }

  await loadCatalog({ documentRef, fetchImpl })

  assert.equal(documentRef.elements.get('catalog-message').textContent, '工具列表加载失败，请重试。')
  assert.equal(documentRef.elements.get('catalog-retry').hidden, false)
  assert.equal(documentRef.elements.get('tool-groups').children.length, 0)

  await documentRef.elements.get('catalog-retry').listeners.get('click')()

  assert.equal(requests, 2)
  assert.equal(documentRef.elements.get('catalog-message').textContent, '')
  assert.equal(documentRef.elements.get('catalog-retry').hidden, true)
  assert.equal(documentRef.elements.get('tool-groups').children.length, 1)
})

test('shows a clear empty state when the generated catalog contains no tools', async () => {
  const documentRef = createDocument()

  await loadCatalog({
    documentRef,
    fetchImpl: async () => ({ ok: true, json: async () => ({ schemaVersion: 1, tools: [] }) }),
  })

  assert.equal(documentRef.elements.get('tool-groups').children.length, 0)
  assert.equal(documentRef.elements.get('catalog-message').textContent, '当前还没有可用工具。')
  assert.equal(documentRef.elements.get('catalog-retry').hidden, true)
})
