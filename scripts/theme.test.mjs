import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

class ThemeGuard {
  static themeCss() {
    return readFileSync(path.join(repositoryRoot, 'styles/theme.css'), 'utf8')
  }

  static designDoc() {
    return readFileSync(path.join(repositoryRoot, 'docs/frontend-design-style.md'), 'utf8')
  }

  static tokens(css) {
    const names = []
    for (const match of css.matchAll(/--([A-Za-z0-9_\\.*-]+)\s*:\s*([^;]+);/g)) {
      const name = match[1].replaceAll('\\.', '.')
      if (name.includes('*') || name.includes('--') || match[2].trim() === 'initial') continue
      names.push(name)
    }
    return names
  }

  static resets(css) {
    return [
      '--color-*: initial',
      '--text-*: initial',
      '--spacing: initial',
      '--breakpoint-*: initial',
      '--container-*: initial',
      '--radius: initial',
      '--radius-*: initial',
      '--shadow: initial',
      '--shadow-*: initial',
      '--tracking-*: initial',
    ].filter((reset) => !css.includes(reset))
  }

  static sourceFiles(directory, extension) {
    const files = []
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue
        files.push(...ThemeGuard.sourceFiles(fullPath, extension))
      } else if (entry.name.endsWith(extension)) files.push(fullPath)
    }
    return files
  }

  static classStrings(source) {
    const strings = []
    for (const match of source.matchAll(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/gs)) {
      if (match[1] !== undefined) strings.push(match[1])
      else if (match[2] !== undefined) strings.push(match[2])
      else strings.push(...ThemeGuard.quotedPieces(match[3]))
    }
    return strings
  }

  static quotedPieces(expression) {
    const pieces = []
    for (const match of expression.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
      pieces.push((match[1] ?? match[2] ?? match[3]).replace(/\$\{[^}]*\}/g, ' '))
    }
    return pieces
  }

  static utilities(classString) {
    return classString.split(/\s+/).filter(Boolean).map((token) => token.replace(/^!/, ''))
  }

  static violations(classString, tokens) {
    const names = ThemeGuard.tokenSets(tokens)
    const violations = []
    for (const utility of ThemeGuard.utilities(classString)) {
      const violation = ThemeGuard.utilityViolation(utility, names)
      if (violation) violations.push(violation)
    }
    return violations
  }

  static tokenSets(tokens) {
    const suffixes = (prefix) => new Set(tokens.filter((token) => token.startsWith(prefix)).map((token) => token.slice(prefix.length)))
    return {
      breakpoints: suffixes('breakpoint-'),
      colors: suffixes('color-'),
      containers: suffixes('container-'),
      fonts: suffixes('font-'),
      radii: suffixes('radius-'),
      shadows: suffixes('shadow-'),
      spacing: suffixes('spacing-'),
      text: suffixes('text-'),
      tracking: suffixes('tracking-'),
    }
  }

  static utilityViolation(utility, names) {
    if (utility.includes('[')) return utility
    const parts = utility.split(':')
    const body = parts.at(-1)
    for (const variant of parts.slice(0, -1)) {
      const breakpoint = variant.startsWith('max-') ? variant.slice(4) : variant
      const defaultBreakpoint = /^(sm|md|lg|xl|2xl)$/.test(breakpoint) && (variant === breakpoint || variant === `max-${breakpoint}`)
      if (defaultBreakpoint || (variant.startsWith('max-') && !names.breakpoints.has(breakpoint))) return utility
    }
    return ThemeGuard.bodyViolation(body, names)
  }

  static bodyViolation(body, names) {
    const bare = body.replace(/\/[0-9.]+$/, '')
    if (/^text-(xs|sm|base|lg|xl|[2-9]xl)$/.test(bare)) return body
    if (/^rounded-(xs|sm|md|lg|xl|2xl|3xl|4xl)$/.test(bare) || bare === 'rounded') return body
    if (/^shadow-(2xs|xs|sm|md|lg|xl|2xl|inner)$/.test(bare) || bare === 'shadow') return body
    if (/^tracking-(tighter|tight|normal|wide|wider|widest)$/.test(bare)) return body
    if (/^max-w-(3xs|2xs|xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)$/.test(bare)) return body
    if (/^font-serif$/.test(bare)) return body
    if (/^(bg|text|border|ring|outline|from|via|to|fill|stroke|decoration|caret|accent|divide|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?(?:\/[0-9.]+)?$/.test(body)) return body

    const spacing = body.match(/^(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|size|w|h|min-w|min-h|max-w|max-h|space-x|space-y)-([a-z0-9.]+)$/)
    if (spacing) {
      const suffix = spacing[1]
      const staticSize = /^(full|screen|svh|dvh|lvh|svw|dvw|lvw|auto|min|max|fit|px)$/.test(suffix)
      const containerWidth = body.startsWith('max-w-') && names.containers.has(suffix)
      if (!staticSize && !containerWidth && !names.spacing.has(suffix)) return body
    }
    const position = body.match(/^(?:inset|inset-x|inset-y|top|right|bottom|left)-(\d+(?:\.\d+)?)$/)
    if (position && !names.spacing.has(position[1])) return body

    const rounded = bare.match(/^rounded-(.+)$/)
    if (rounded && !names.radii.has(rounded[1])) return body
    const shadow = bare.match(/^shadow-(.+)$/)
    if (shadow && !names.shadows.has(shadow[1])) return body
    const tracking = bare.match(/^tracking-(.+)$/)
    if (tracking && !names.tracking.has(tracking[1])) return body
    const font = bare.match(/^font-(.+)$/)
    const fontWeight = /^(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(font?.[1] ?? '')
    if (font && !fontWeight && !names.fonts.has(font[1])) return body

    const text = bare.match(/^text-(.+)$/)
    const textStatic = /^(left|center|right|justify|start|end|balance|pretty|wrap|nowrap|ellipsis|clip|inherit|current|transparent)$/.test(text?.[1] ?? '')
    if (text && !textStatic && !names.text.has(text[1]) && !names.colors.has(text[1])) return body

    const color = bare.match(/^(?:bg|border|ring|outline|from|via|to|fill|stroke|decoration|caret|accent|divide|placeholder)-(.+)$/)
    const colorStatic = /^(b|t|l|r|x|y|s|e|0|1|2|4|8|solid|dashed|dotted|double|hidden|none|collapse|separate|inherit|current|transparent)$/.test(color?.[1] ?? '')
    if (color && !colorStatic && !names.colors.has(color[1])) return body
    return null
  }

  static classViolations(tokens) {
    const violations = []
    const directories = [path.join(repositoryRoot, 'catalog'), path.join(repositoryRoot, 'tools')]
    for (const directory of directories) {
      for (const file of ThemeGuard.sourceFiles(directory, '.tsx')) {
        const source = readFileSync(file, 'utf8')
        for (const classString of ThemeGuard.classStrings(source)) {
          for (const violation of ThemeGuard.violations(classString, tokens)) {
            violations.push(`${path.relative(repositoryRoot, file)}: ${violation}`)
          }
        }
      }
    }
    return violations
  }

  static strayHex() {
    const files = [
      ...ThemeGuard.sourceFiles(path.join(repositoryRoot, 'styles'), '.css'),
      ...ThemeGuard.sourceFiles(path.join(repositoryRoot, 'catalog'), '.css'),
    ]
    return files
      .filter((file) => path.basename(file) !== 'theme.css')
      .filter((file) => /#[0-9A-Fa-f]{3,8}\b/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(repositoryRoot, file))
  }
}

test('theme.css clears default namespaces and every token is named in the design doc', () => {
  const css = ThemeGuard.themeCss()
  const doc = ThemeGuard.designDoc()
  const tokens = ThemeGuard.tokens(css)

  assert.deepEqual(ThemeGuard.resets(css), [])
  assert.ok(tokens.includes('color-canvas'))
  assert.ok(tokens.includes('breakpoint-phone'))
  assert.ok(tokens.includes('spacing-1.5'))
  const missing = tokens.filter((token) => !doc.includes(token))
  assert.deepEqual(missing, [])
})

test('design doc does not restate raw colors', () => {
  assert.equal(ThemeGuard.designDoc().match(/#[0-9A-Fa-f]{3,8}\b|rgb\(|hsl\(/), null)
})

test('class strings stay on theme utilities', () => {
  const tokens = ThemeGuard.tokens(ThemeGuard.themeCss())
  assert.deepEqual(ThemeGuard.violations('bg-canvas text-ink rounded-panel shadow-panel max-phone:pt-gutter max-stack:gap-section top-nav', tokens), [])
  assert.deepEqual(ThemeGuard.violations('top-6', tokens), ['top-6'])
  assert.deepEqual(ThemeGuard.violations('bg-red-500 text-sm rounded-lg shadow-md md:flex max-md:hidden tracking-tight max-w-xl p-6 text-[11px] font-serif', tokens), [
    'bg-red-500',
    'text-sm',
    'rounded-lg',
    'shadow-md',
    'md:flex',
    'max-md:hidden',
    'tracking-tight',
    'max-w-xl',
    'p-6',
    'text-[11px]',
    'font-serif',
  ])
  assert.deepEqual(ThemeGuard.classViolations(tokens), [])
})

test('component css outside the theme file has no hex colors', () => {
  assert.deepEqual(ThemeGuard.strayHex(), [])
})
