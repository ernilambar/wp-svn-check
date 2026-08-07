import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripVTControlCharacters } from 'node:util'
import { renderTerminal } from '../../src/render/terminal.js'

function captureOutput (t) {
  const mock = t.mock.method(console, 'log', () => {})
  return () => mock.mock.calls.map((call) => stripVTControlCharacters(String(call.arguments[0]))).join('\n')
}

const HEALTHY_REPORT = {
  slug: 'hello-dolly',
  meta: {
    plugin_name: 'Hello Dolly',
    plugin_file: 'hello.php',
    stable_tag: '1.7.2',
    trunk_version: '1.7.2',
    requires_php: '5.6',
    tested_up_to: '6.6',
    svn_url: 'https://plugins.svn.wordpress.org/hello-dolly/'
  },
  summary: { pass: 3, warn: 1, fail: 0, info: 2 },
  sections: [
    {
      id: 'root',
      label: 'Main SVN Folder',
      summary: { pass: 2, warn: 1, fail: 0, info: 0 },
      checks: [
        { label: 'trunk/ exists', status: 'pass', detail: 'Found' },
        { label: 'tags/ exists', status: 'pass', detail: 'Found' },
        { label: 'assets/ exists', status: 'warn', detail: 'Missing — optional but recommended' }
      ]
    },
    {
      id: 'assets',
      label: 'Assets',
      summary: { pass: 1, warn: 0, fail: 0, info: 2 },
      checks: [
        { label: 'Banner image present', status: 'info', detail: 'banner-772x250.(png|jpg) not found — optional' },
        { label: 'Icon image present', status: 'pass', detail: 'icon-128x128.png' }
      ]
    }
  ]
}

const NOT_FOUND_REPORT = {
  slug: 'nonexistent-plugin',
  meta: { error: 'not_found', svn_url: 'https://plugins.svn.wordpress.org/nonexistent-plugin/' },
  summary: {},
  sections: []
}

const UNREACHABLE_REPORT = {
  slug: 'hello-dolly',
  meta: { error: 'unreachable', svn_url: 'https://plugins.svn.wordpress.org/hello-dolly/' },
  summary: {},
  sections: []
}

test('renders header with plugin name, slug, and svn url', (t) => {
  const getOutput = captureOutput(t)
  renderTerminal(HEALTHY_REPORT)
  const output = getOutput()

  assert.match(output, /Hello Dolly/)
  assert.match(output, /\(hello-dolly\)/)
  assert.match(output, /https:\/\/plugins\.svn\.wordpress\.org\/hello-dolly\//)
})

test('renders meta line with stable tag, trunk version, requires php, tested up to', (t) => {
  const getOutput = captureOutput(t)
  renderTerminal(HEALTHY_REPORT)
  const output = getOutput()

  assert.match(output, /Stable tag: 1\.7\.2/)
  assert.match(output, /Trunk version: 1\.7\.2/)
  assert.match(output, /Requires PHP: 5\.6/)
  assert.match(output, /Tested up to: 6\.6/)
})

test('omits missing meta fields entirely', (t) => {
  const getOutput = captureOutput(t)
  renderTerminal({
    ...HEALTHY_REPORT,
    meta: { ...HEALTHY_REPORT.meta, stable_tag: null, trunk_version: null, requires_php: null, tested_up_to: null }
  })
  const output = getOutput()

  assert.doesNotMatch(output, /Stable tag/)
  assert.doesNotMatch(output, /Trunk version/)
  assert.doesNotMatch(output, /Requires PHP/)
  assert.doesNotMatch(output, /Tested up to/)
})

test('renders every section label, check label, and detail', (t) => {
  const getOutput = captureOutput(t)
  renderTerminal(HEALTHY_REPORT)
  const output = getOutput()

  assert.match(output, /Main SVN Folder/)
  assert.match(output, /trunk\/ exists/)
  assert.match(output, /tags\/ exists/)
  assert.match(output, /assets\/ exists/)
  assert.match(output, /Missing — optional but recommended/)
  assert.match(output, /Assets/)
  assert.match(output, /Banner image present/)
  assert.match(output, /Icon image present/)
})

test('renders the footer summary counts', (t) => {
  const getOutput = captureOutput(t)
  renderTerminal(HEALTHY_REPORT)
  const output = getOutput()

  assert.match(output, /3 pass · 1 warn · 0 fail · 2 info/)
})

test('renders a single not_found error line, no table', (t) => {
  const getOutput = captureOutput(t)
  renderTerminal(NOT_FOUND_REPORT)
  const output = getOutput()

  assert.match(output, /No SVN repo found for "nonexistent-plugin"/)
  assert.doesNotMatch(output, /pass ·/)
})

test('renders a single unreachable error line, distinct wording from not_found', (t) => {
  const getOutput = captureOutput(t)
  renderTerminal(UNREACHABLE_REPORT)
  const output = getOutput()

  assert.match(output, /Couldn't reach plugins\.svn\.wordpress\.org \(network\/timeout\)/)
  assert.doesNotMatch(output, /No SVN repo found/)
})

test('error cases only emit a single console.log call', (t) => {
  const mock = t.mock.method(console, 'log', () => {})
  renderTerminal(NOT_FOUND_REPORT)

  assert.equal(mock.mock.calls.length, 1)
})
