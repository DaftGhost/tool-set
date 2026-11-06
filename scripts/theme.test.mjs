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

  static cssRoots() {
    return ['styles', 'catalog', 'tools', 'shared']
  }

  static scannedCss() {
    return ThemeGuard.cssRoots().flatMap((root) => ThemeGuard.sourceFiles(path.join(repositoryRoot, root), '.css'))
  }

  static componentCss() {
    return ThemeGuard.scannedCss().filter((file) => path.basename(file) !== 'theme.css')
  }

  static hasRawColor(css) {
    return /#[0-9A-Fa-f]{3,8}\b|rgb\(|hsl\(|hwb\(|oklch\(|oklab\(/.test(css)
  }

  static strayColors() {
    return ThemeGuard.componentCss()
      .filter((file) => ThemeGuard.hasRawColor(readFileSync(file, 'utf8')))
      .map((file) => path.relative(repositoryRoot, file))
  }

  static applyStrings(css) {
    return [...css.matchAll(/@apply\s+([^;]+);/g)].map((match) => match[1].replace(/\s+/g, ' ').trim())
  }

  static applyViolationsIn(css, tokens, label = '') {
    const violations = []
    for (const classString of ThemeGuard.applyStrings(css)) {
      for (const violation of ThemeGuard.violations(classString, tokens)) {
        violations.push(`${label}${violation}`)
      }
    }
    return violations
  }

  static applyViolations(tokens) {
    const violations = []
    for (const file of ThemeGuard.componentCss()) {
      const label = `${path.relative(repositoryRoot, file)}: `
      violations.push(...ThemeGuard.applyViolationsIn(readFileSync(file, 'utf8'), tokens, label))
    }
    return violations
  }

  static utilityBlocks(css) {
    const blocks = []
    for (const match of css.matchAll(/@utility\s+([A-Za-z0-9_-]+)\s*\{/g)) {
      const open = match.index + match[0].length
      blocks.push({ name: match[1], body: css.slice(open, ThemeGuard.closingBrace(css, open)) })
    }
    return blocks
  }

  static closingBrace(css, open) {
    let depth = 1
    for (let index = open; index < css.length; index += 1) {
      const character = css[index]
      if (character === '{') depth += 1
      else if (character === '}') {
        depth -= 1
        if (depth === 0) return index
      }
    }
    return css.length
  }

  static rewritesPageFrame(body) {
    return /100%\s*-\s*2\s*\*\s*var\(--spacing-gutter/.test(body)
  }

  static frameLengthViolations(css, label = '') {
    const violations = []
    for (const block of ThemeGuard.utilityBlocks(css)) {
      if (!ThemeGuard.rewritesPageFrame(block.body)) continue
      for (const length of block.body.match(/\d+(?:\.\d+)?px/g) ?? []) {
        violations.push(`${label}${block.name}: ${length}`)
      }
    }
    return violations
  }

  static componentFrameLengths() {
    const violations = []
    for (const file of ThemeGuard.componentCss()) {
      const label = `${path.relative(repositoryRoot, file)}: `
      violations.push(...ThemeGuard.frameLengthViolations(readFileSync(file, 'utf8'), label))
    }
    return violations
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
  assert.deepEqual(ThemeGuard.applyViolationsIn('@apply bg-canvas pt-block;', tokens), [])
  assert.deepEqual(ThemeGuard.applyViolationsIn('@apply bg-red-500 p-6;', tokens), ['bg-red-500', 'p-6'])
  assert.deepEqual(ThemeGuard.applyViolations(tokens), [])
})

test('theme guard scans styles, catalog, tool, and shared css', () => {
  const expected = ['styles', 'catalog', 'tools', 'shared'].flatMap((root) => (
    ThemeGuard.sourceFiles(path.join(repositoryRoot, root), '.css').map((file) => path.relative(repositoryRoot, file))
  )).sort()

  assert.deepEqual(ThemeGuard.scannedCss().map((file) => path.relative(repositoryRoot, file)).sort(), expected)
  assert.ok(expected.includes('styles/theme.css'))
  assert.ok(expected.includes('styles/base.css'))
  assert.ok(expected.includes('catalog/src/styles.css'))
  assert.ok(expected.includes('shared/home-orb/home-orb.css'))
  assert.ok(expected.includes('tools/llm-api-cost-calculator/src/styles.css'))
  assert.ok(expected.includes('tools/llm-api-cost-calculator/src/chart.css'))
  assert.ok(expected.includes('tools/privacy-profile-generator/src/styles.css'))
  assert.ok(expected.includes('tools/random-persona-generator/src/styles.css'))
  assert.ok(expected.includes('tools/text-formatter/src/styles.css'))
})

test('component css outside the theme file has no raw colors', () => {
  assert.equal(ThemeGuard.hasRawColor('color: #fff; background: rgb(0 0 0);'), true)
  assert.equal(ThemeGuard.hasRawColor('color: hsl(0 0% 0%);'), true)
  assert.equal(ThemeGuard.hasRawColor('color: var(--color-ink);'), false)
  assert.deepEqual(ThemeGuard.strayColors(), [])
})

test('page-frame rewrites keep lengths on theme tokens', () => {
  assert.deepEqual(ThemeGuard.frameLengthViolations(`
    @utility content-frame {
      width: min(100% - 2 * var(--spacing-gutter-stack), 740px);
      padding-top: 36px;
    }
  `), ['content-frame: 740px', 'content-frame: 36px'])
  assert.deepEqual(ThemeGuard.frameLengthViolations(`
    @utility content-frame {
      width: min(100% - 2 * var(--spacing-gutter-stack), var(--container-stack));
      padding-top: var(--spacing-block-stack);
    }
  `), [])
  assert.deepEqual(ThemeGuard.frameLengthViolations(`
    @utility stepper {
      height: 42px;
    }
  `), [])
  assert.deepEqual(ThemeGuard.componentFrameLengths(), [])
})
