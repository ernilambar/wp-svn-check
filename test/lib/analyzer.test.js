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

const TRUNK_LISTING = '<a href="../">..</a><a href="hello-dolly.php">hello-dolly.php</a><a href="readme.txt">readme.txt</a>'
const ASSETS_LISTING = '<a href="../">..</a><a href="banner-772x250.png">banner-772x250.png</a><a href="icon-128x128.png">icon-128x128.png</a>'

const HEALTHY_RESPONSES = {
  'trunk/readme.txt': [200, README_TXT],
  'trunk/': [200, TRUNK_LISTING],
  'trunk/hello-dolly.php': [200, PHP_HEADER],
  'tags/': [200, ''],
  'assets/': [200, ASSETS_LISTING],
  'tags/1.7.2/': [200, ''],
  'tags/1.7.2/readme.txt': [200, README_TXT],
  'tags/1.7.2/hello-dolly.php': [200, PHP_HEADER]
}

function withMockAgent (t) {
  const originalDispatcher = getGlobalDispatcher()
  const agent = new MockAgent()
  agent.disableNetConnect()
  setGlobalDispatcher(agent)

  t.after(() => setGlobalDispatcher(originalDispatcher))

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
  assert.deepEqual(report.summary, { pass: 17, warn: 0, fail: 0, info: 0 })
  assert.equal(check(report, 'assets', 'Banner image present').status, 'pass')
  assert.equal(check(report, 'assets', 'Icon image present').status, 'pass')
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
