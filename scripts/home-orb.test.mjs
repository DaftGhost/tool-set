import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SiteHome } from '../shared/home-orb/siteHome.ts'

test('home orb links to the site root above a tool path', () => {
  assert.equal(SiteHome.label, '返回工具集首页')
  assert.equal(SiteHome.href('/tools/text-formatter/'), '/')
  assert.equal(SiteHome.href('/tools/text-formatter'), '/')
  assert.equal(SiteHome.href('/tools/text-formatter/index.html'), '/')
  assert.equal(SiteHome.href('/preview/tools/random-persona-generator/'), '/preview/')
  assert.equal(SiteHome.href('/'), '/')
})
