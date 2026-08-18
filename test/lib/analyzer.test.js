import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici'
import { analyze } from '../../src/lib/analyzer.js'

const SLUG = 'hello-dolly'
const BASE_PATH = `/${SLUG}`

const README_TXT = `=== Hello Dolly ===
Stable tag: 1.7.2
Requires at least: 5.5
Tested up to: 6.6
Requires PHP: 7.2

Description.
`

const PHP_HEADER = `<?php
/**
 * Plugin Name: Hello Dolly
 * Version: 1.7.2
 * Requires at least: 5.5
 * Requires PHP: 7.2
 */
`

const ROOT_LISTING = '<a href="../">..</a><a href="assets/">assets/</a><a href="tags/">tags/</a><a href="trunk/">trunk/</a>'
const TRUNK_LISTING = '<a href="../">..</a><a href="hello-dolly.php">hello-dolly.php</a><a href="readme.txt">readme.txt</a>'
const TAGS_LISTING = '<a href="../">..</a><a href="1.7.2/">1.7.2/</a>'
const ASSETS_LISTING = '<a href="../">..</a><a href="banner-772x250.png">banner-772x250.png</a><a href="icon-128x128.png">icon-128x128.png</a>'

const HEALTHY_RESPONSES = {
  '': [200, ROOT_LISTING],
  'trunk/readme.txt': [200, README_TXT],
  'trunk/': [200, TRUNK_LISTING],
  'trunk/hello-dolly.php': [200, PHP_HEADER],
  'tags/': [200, TAGS_LISTING],
  'assets/': [200, ASSETS_LISTING],
  'tags/1.7.2/': [200, ''],
  'tags/1.7.2/readme.txt': [200, README_TXT],
  'tags/1.7.2/hello-dolly.php': [200, PHP_HEADER]
}

function withMockAgent (t, pools = {}) {
  const originalDispatcher = getGlobalDispatcher()
  const agent = new MockAgent()
  agent.disableNetConnect()
  setGlobalDispatcher(agent)

  t.after(() => setGlobalDispatcher(originalDispatcher))

  pools.pluginApi = agent.get('https://api.wordpress.org')
  return agent.get('https://plugins.svn.wordpress.org')
}

function mockResponses (pool, overrides = {}) {
  const responses = { ...HEALTHY_RESPONSES, ...overrides }

  for (const [path, [code, body]] of Object.entries(responses)) {
    pool.intercept({ path: `${BASE_PATH}/${path}`, method: 'GET' }).reply(code, body)
  }
}

function section (report, id) {
  return report.sections.find((s) => s.id === id)
}

function check (report, sectionId, label) {
  return section(report, sectionId).checks.find((c) => c.label === label)
}

test('a healthy plugin passes every check', async (t) => {
  mockResponses(withMockAgent(t))

  const report = await analyze(SLUG)

  assert.equal(report.meta.error, undefined)
  assert.equal(report.meta.plugin_name, 'Hello Dolly')
  assert.equal(report.meta.plugin_file, 'hello-dolly.php')
  assert.equal(report.meta.stable_tag, '1.7.2')
  assert.equal(report.meta.trunk_version, '1.7.2')
  assert.deepEqual(report.summary, { pass: 22, warn: 0, fail: 0, info: 2 })
  assert.equal(check(report, 'trunk', 'Requires Plugins declared').status, 'info')
  assert.equal(check(report, 'stable_tag', 'Requires Plugins declared').status, 'info')
  assert.equal(check(report, 'assets', 'Banner image present').status, 'pass')
  assert.equal(check(report, 'assets', 'Icon image present').status, 'pass')
})

test('a stray file in the SVN root fails the unexpected-files check', async (t) => {
  const rootWithStrayFile = `${ROOT_LISTING}<a href="notes.txt">notes.txt</a>`
  mockResponses(withMockAgent(t), { '': [200, rootWithStrayFile] })

  const report = await analyze(SLUG)

  const rootCheck = check(report, 'root', 'No unexpected files/directories')
  assert.equal(rootCheck.status, 'fail')
  assert.match(rootCheck.detail, /notes\.txt/)
})

test('a loose file directly under tags/ fails the unexpected-files-at-tags check', async (t) => {
  const tagsWithStrayFile = `${TAGS_LISTING}<a href="notes.txt">notes.txt</a>`
  mockResponses(withMockAgent(t), { 'tags/': [200, tagsWithStrayFile] })

  const report = await analyze(SLUG)

  const tagsCheck = check(report, 'root', 'No unexpected files at tags/')
  assert.equal(tagsCheck.status, 'fail')
  assert.match(tagsCheck.detail, /notes\.txt/)
})

test('a disallowed file extension in assets/ fails the unexpected-files check', async (t) => {
  const assetsWithStrayFile = `${ASSETS_LISTING}<a href="notes.txt">notes.txt</a>`
  mockResponses(withMockAgent(t), { 'assets/': [200, assetsWithStrayFile] })

  const report = await analyze(SLUG)

  const assetsCheck = check(report, 'assets', 'No unexpected files/directories')
  assert.equal(assetsCheck.status, 'fail')
  assert.match(assetsCheck.detail, /notes\.txt/)
})

test('a blueprints/ dir in assets/ is allowed and reports blueprint.json presence', async (t) => {
  const assetsWithBlueprints = `${ASSETS_LISTING}<a href="blueprints/">blueprints/</a>`
  mockResponses(withMockAgent(t), {
    'assets/': [200, assetsWithBlueprints],
    'assets/blueprints/blueprint.json': [200, '{}']
  })

  const report = await analyze(SLUG)

  assert.equal(check(report, 'assets', 'No unexpected files/directories').status, 'pass')
  const blueprintCheck = check(report, 'assets', 'blueprints/blueprint.json present')
  assert.equal(blueprintCheck.status, 'info')
  assert.match(blueprintCheck.detail, /Live Preview is active/)
})

test('a blueprints/ dir without blueprint.json reports it as optional but missing', async (t) => {
  const assetsWithBlueprints = `${ASSETS_LISTING}<a href="blueprints/">blueprints/</a>`
  mockResponses(withMockAgent(t), {
    'assets/': [200, assetsWithBlueprints],
    'assets/blueprints/blueprint.json': [404, 'Not Found']
  })

  const report = await analyze(SLUG)

  const blueprintCheck = check(report, 'assets', 'blueprints/blueprint.json present')
  assert.equal(blueprintCheck.status, 'info')
  assert.match(blueprintCheck.detail, /Not found/)
})

test('a .zip file in trunk/ fails the trunk unexpected-zip check', async (t) => {
  const trunkWithZip = `${TRUNK_LISTING}<a href="hello-dolly.zip">hello-dolly.zip</a>`
  mockResponses(withMockAgent(t), { 'trunk/': [200, trunkWithZip] })

  const report = await analyze(SLUG)

  const zipCheck = check(report, 'trunk', 'No unexpected .zip files')
  assert.equal(zipCheck.status, 'fail')
  assert.match(zipCheck.detail, /hello-dolly\.zip/)
})

test('a .zip file in the stable tag folder fails its unexpected-zip check', async (t) => {
  const tagWithZip = '<a href="../">..</a><a href="hello-dolly.zip">hello-dolly.zip</a>'
  mockResponses(withMockAgent(t), { 'tags/1.7.2/': [200, tagWithZip] })

  const report = await analyze(SLUG)

  const zipCheck = check(report, 'stable_tag', 'No unexpected .zip files')
  assert.equal(zipCheck.status, 'fail')
  assert.match(zipCheck.detail, /hello-dolly\.zip/)
})

test('a nonexistent slug reports not_found, not unreachable', async (t) => {
  const pool = withMockAgent(t)

  pool.intercept({ path: `${BASE_PATH}/trunk/readme.txt`, method: 'GET' }).reply(404, 'Not Found')
  pool.intercept({ path: `${BASE_PATH}/trunk/README.txt`, method: 'GET' }).reply(404, 'Not Found')
  pool.intercept({ path: `${BASE_PATH}/trunk/readme.md`, method: 'GET' }).reply(404, 'Not Found')
  pool.intercept({ path: `${BASE_PATH}/trunk/README.md`, method: 'GET' }).reply(404, 'Not Found')
  pool.intercept({ path: `${BASE_PATH}/trunk/`, method: 'GET' }).reply(404, 'Not Found')

  const report = await analyze(SLUG)

  assert.deepEqual(report, {
    slug: SLUG,
    meta: { error: 'not_found', svn_url: `https://plugins.svn.wordpress.org/${SLUG}/` },
    summary: { pass: 0, warn: 0, fail: 0, info: 0 },
    sections: []
  })
})

test('a fully unreachable mirror reports unreachable, not not_found', async (t) => {
  const pool = withMockAgent(t)

  pool.intercept({ path: `${BASE_PATH}/trunk/readme.txt`, method: 'GET' }).replyWithError(new Error('connection refused'))
  pool.intercept({ path: `${BASE_PATH}/trunk/README.txt`, method: 'GET' }).replyWithError(new Error('connection refused'))
  pool.intercept({ path: `${BASE_PATH}/trunk/readme.md`, method: 'GET' }).replyWithError(new Error('connection refused'))
  pool.intercept({ path: `${BASE_PATH}/trunk/README.md`, method: 'GET' }).replyWithError(new Error('connection refused'))
  pool.intercept({ path: `${BASE_PATH}/trunk/`, method: 'GET' }).replyWithError(new Error('connection refused'))

  const report = await analyze(SLUG)

  assert.equal(report.meta.error, 'unreachable')
  assert.notEqual(report.meta.error, 'not_found')
})

test('a resolve phase with at least one real response is not_found even if others transport-fail', async (t) => {
  const pool = withMockAgent(t)

  pool.intercept({ path: `${BASE_PATH}/trunk/readme.txt`, method: 'GET' }).replyWithError(new Error('connection refused'))
  pool.intercept({ path: `${BASE_PATH}/trunk/README.txt`, method: 'GET' }).reply(404, 'Not Found')
  pool.intercept({ path: `${BASE_PATH}/trunk/readme.md`, method: 'GET' }).reply(404, 'Not Found')
  pool.intercept({ path: `${BASE_PATH}/trunk/README.md`, method: 'GET' }).reply(404, 'Not Found')
  pool.intercept({ path: `${BASE_PATH}/trunk/`, method: 'GET' }).reply(404, 'Not Found')

  const report = await analyze(SLUG)

  assert.equal(report.meta.error, 'not_found')
})

test('missing assets/ warns but does not fail other sections', async (t) => {
  mockResponses(withMockAgent(t), { 'assets/': [404, 'Not Found'] })

  const report = await analyze(SLUG)

  assert.equal(check(report, 'root', 'assets/ exists').status, 'warn')
  assert.equal(check(report, 'assets', 'Banner image present').status, 'info')
  assert.equal(check(report, 'assets', 'Icon image present').status, 'info')
  assert.equal(report.summary.fail, 0)
})

test('a missing main PHP file cascades warns through the trunk section', async (t) => {
  const listingWithoutPhp = '<a href="../">..</a><a href="readme.txt">readme.txt</a>'
  mockResponses(withMockAgent(t), { 'trunk/': [200, listingWithoutPhp] })

  const report = await analyze(SLUG)

  assert.equal(report.meta.plugin_file, null)
  assert.equal(check(report, 'trunk', 'Main plugin PHP file found').status, 'warn')
  assert.equal(check(report, 'trunk', 'Version declared in PHP header').status, 'warn')
  assert.equal(check(report, 'trunk', 'Stable tag matches PHP version').status, 'warn')
  assert.equal(section(report, 'stable_tag').checks.length, 1)
})

test('a stable-tag/version mismatch fails the comparison check', async (t) => {
  const mismatchedPhp = PHP_HEADER.replace('Version: 1.7.2', 'Version: 1.7.0')
  mockResponses(withMockAgent(t), { 'trunk/hello-dolly.php': [200, mismatchedPhp] })

  const report = await analyze(SLUG)

  assert.equal(report.meta.trunk_version, '1.7.0')
  assert.equal(check(report, 'trunk', 'Stable tag matches PHP version').status, 'fail')
})

test('required plugins must exist in the WordPress.org plugin directory', async (t) => {
  const phpWithDependencies = PHP_HEADER.replace(
    'Requires PHP: 7.2',
    'Requires PHP: 7.2\n * Requires Plugins: existing-plugin, missing-plugin'
  )
  const pools = {}
  const pool = withMockAgent(t, pools)
  mockResponses(pool, { 'trunk/hello-dolly.php': [200, phpWithDependencies] })
  const apiPool = pools.pluginApi

  apiPool.intercept({ path: '/plugins/info/1.0/existing-plugin', method: 'GET' }).reply(200, 'plugin data')
  apiPool.intercept({ path: '/plugins/info/1.0/missing-plugin', method: 'GET' }).reply(404, 'Plugin not found')

  const report = await analyze(SLUG)

  assert.equal(report.meta.requires_plugins, 'existing-plugin, missing-plugin')
  assert.equal(check(report, 'trunk', 'Required plugin "existing-plugin" exists').status, 'pass')
  assert.equal(check(report, 'trunk', 'Required plugin "missing-plugin" exists').status, 'fail')
})

test('Requires Plugins is declared in both the trunk and stable tag blocks', async (t) => {
  const phpWithDependencies = PHP_HEADER.replace(
    'Requires PHP: 7.2',
    'Requires PHP: 7.2\n * Requires Plugins: existing-plugin'
  )
  const pools = {}
  const pool = withMockAgent(t, pools)
  mockResponses(pool, {
    'trunk/hello-dolly.php': [200, phpWithDependencies],
    'tags/1.7.2/hello-dolly.php': [200, phpWithDependencies]
  })
  pools.pluginApi.intercept({ path: '/plugins/info/1.0/existing-plugin', method: 'GET' }).reply(200, 'plugin data')

  const report = await analyze(SLUG)

  assert.equal(check(report, 'trunk', 'Requires Plugins declared').detail, 'existing-plugin')
  assert.equal(check(report, 'stable_tag', 'Requires Plugins declared').detail, 'existing-plugin')
})

test('a stable tag declared in readme but missing as a tag folder fails, skipping tag content checks', async (t) => {
  mockResponses(withMockAgent(t), { 'tags/1.7.2/': [404, 'Not Found'] })

  const report = await analyze(SLUG)

  assert.equal(check(report, 'stable_tag', 'tags/1.7.2/ exists').status, 'fail')
  assert.equal(section(report, 'stable_tag').checks.length, 1)
})

test('a malicious Stable tag is rejected by the path guard, not fetched', async (t) => {
  const maliciousReadme = README_TXT.replace('Stable tag: 1.7.2', 'Stable tag: ../../foo')
  mockResponses(withMockAgent(t), { 'trunk/readme.txt': [200, maliciousReadme] })

  const report = await analyze(SLUG)

  assert.equal(report.meta.stable_tag, null)
  assert.equal(check(report, 'trunk', 'Stable tag declared').status, 'fail')
  assert.equal(section(report, 'stable_tag'), undefined)
})
