import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../../src/render/markdown.js'

function captureOutput (t) {
  const mock = t.mock.method(console, 'log', () => {})
  return () => mock.mock.calls.map((call) => String(call.arguments[0])).join('\n')
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

test('renders the # SVN Check heading with the slug', (t) => {
  const getOutput = captureOutput(t)
  renderMarkdown(HEALTHY_REPORT)

  assert.match(getOutput(), /^# SVN Check: hello-dolly/m)
})

test('renders meta as a bullet list', (t) => {
  const getOutput = captureOutput(t)
  renderMarkdown(HEALTHY_REPORT)
  const output = getOutput()

  assert.match(output, /- \*\*Plugin name:\*\* Hello Dolly/)
  assert.match(output, /- \*\*SVN URL:\*\* https:\/\/plugins\.svn\.wordpress\.org\/hello-dolly\//)
  assert.match(output, /- \*\*Stable tag:\*\* 1\.7\.2/)
  assert.match(output, /- \*\*Trunk version:\*\* 1\.7\.2/)
  assert.match(output, /- \*\*Requires PHP:\*\* 5\.6/)
  assert.match(output, /- \*\*Tested up to:\*\* 6\.6/)
})

test('falls back to "—" for missing meta fields', (t) => {
  const getOutput = captureOutput(t)
  renderMarkdown({
    ...HEALTHY_REPORT,
    meta: { ...HEALTHY_REPORT.meta, stable_tag: null, trunk_version: null, requires_php: null, tested_up_to: null }
  })

  assert.match(getOutput(), /- \*\*Stable tag:\*\* —/)
})

test('renders each section as a GFM table with Status | Check | Detail columns', (t) => {
  const getOutput = captureOutput(t)
  renderMarkdown(HEALTHY_REPORT)
  const output = getOutput()

  assert.match(output, /## Main SVN Folder/)
  assert.match(output, /\| Status \| Check \| Detail \|/)
  assert.match(output, /\| --- \| --- \| --- \|/)
  assert.match(output, /\| ✅ \| trunk\/ exists \| Found \|/)
  assert.match(output, /\| ⚠️ \| assets\/ exists \| Missing — optional but recommended \|/)
  assert.match(output, /## Assets/)
})

test('maps each status to its emoji: pass ✅, warn ⚠️, fail ❌, info ℹ️', (t) => {
  const getOutput = captureOutput(t)
  renderMarkdown({
    ...HEALTHY_REPORT,
    sections: [
      {
        id: 'root',
        label: 'All Statuses',
        summary: { pass: 1, warn: 1, fail: 1, info: 1 },
        checks: [
          { label: 'a', status: 'pass', detail: '' },
          { label: 'b', status: 'warn', detail: '' },
          { label: 'c', status: 'fail', detail: '' },
          { label: 'd', status: 'info', detail: '' }
        ]
      }
    ]
  })
  const output = getOutput()

  assert.match(output, /\| ✅ \| a \| {2}\|/)
  assert.match(output, /\| ⚠️ \| b \| {2}\|/)
  assert.match(output, /\| ❌ \| c \| {2}\|/)
  assert.match(output, /\| ℹ️ \| d \| {2}\|/)
})

test('escapes pipe characters in check labels and details', (t) => {
  const getOutput = captureOutput(t)
  renderMarkdown({
    ...HEALTHY_REPORT,
    sections: [
      {
        id: 'root',
        label: 'Escaping',
        summary: { pass: 0, warn: 0, fail: 1, info: 0 },
        checks: [
          { label: 'a|b', status: 'fail', detail: 'x | y' }
        ]
      }
    ]
  })

  assert.match(getOutput(), /\| ❌ \| a\\\|b \| x \\\| y \|/)
})

test('renders the summary line at the bottom', (t) => {
  const getOutput = captureOutput(t)
  renderMarkdown(HEALTHY_REPORT)

  assert.match(getOutput(), /3 pass · 1 warn · 0 fail · 2 info$/)
})

test('renders a single bold not_found line, no table', (t) => {
  const getOutput = captureOutput(t)
  renderMarkdown(NOT_FOUND_REPORT)
  const output = getOutput()

  assert.equal(output, '**No SVN repo found for "nonexistent-plugin" (https://plugins.svn.wordpress.org/nonexistent-plugin/)**')
  assert.doesNotMatch(output, /\|/)
})

test('renders a single bold unreachable line with wording distinct from not_found', (t) => {
  const getOutput = captureOutput(t)
  renderMarkdown(UNREACHABLE_REPORT)
  const output = getOutput()

  assert.equal(output, "**Couldn't reach plugins.svn.wordpress.org (network/timeout) — try again**")
  assert.doesNotMatch(output, /No SVN repo found/)
})

test('error cases only emit a single console.log call', (t) => {
  const mock = t.mock.method(console, 'log', () => {})
  renderMarkdown(NOT_FOUND_REPORT)

  assert.equal(mock.mock.calls.length, 1)
})
