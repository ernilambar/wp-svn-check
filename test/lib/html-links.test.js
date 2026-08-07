import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseHtmlLinks } from '../../src/lib/html-links.js'

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/hello-dolly-directory.html', import.meta.url))

test('parseHtmlLinks extracts files and directories', () => {
  const html = `
    <html><body>
      <a href="../">../</a>
      <a href="trunk/">trunk/</a>
      <a href="readme.txt">readme.txt</a>
    </body></html>
  `

  assert.deepEqual(parseHtmlLinks(html), [
    { name: 'trunk/', href: 'trunk/', is_dir: true },
    { name: 'readme.txt', href: 'readme.txt', is_dir: false }
  ])
})

test('parseHtmlLinks skips anchor and query links', () => {
  const html = `
    <a href="#top">Top</a>
    <a href="?C=N;O=D">Name</a>
    <a href="trunk/">trunk/</a>
  `

  assert.deepEqual(parseHtmlLinks(html), [
    { name: 'trunk/', href: 'trunk/', is_dir: true }
  ])
})

test('parseHtmlLinks skips absolute/external URLs', () => {
  const html = '<a href="https://example.com/">External</a><a href="tags/">tags/</a>'

  assert.deepEqual(parseHtmlLinks(html), [
    { name: 'tags/', href: 'tags/', is_dir: true }
  ])
})

test('parseHtmlLinks de-dupes by href', () => {
  const html = '<a href="trunk/">trunk/</a><a href="trunk/">trunk/ (again)</a>'

  assert.deepEqual(parseHtmlLinks(html), [
    { name: 'trunk/', href: 'trunk/', is_dir: true }
  ])
})

test('parseHtmlLinks falls back to href when link text is empty', () => {
  const html = '<a href="assets/"></a>'

  assert.deepEqual(parseHtmlLinks(html), [
    { name: 'assets', href: 'assets/', is_dir: true }
  ])
})

test('parseHtmlLinks matches a captured real directory listing', () => {
  const html = readFileSync(FIXTURE_PATH, 'utf8')
  const items = parseHtmlLinks(html)

  assert.deepEqual(items, [
    { name: 'assets/', href: 'assets/', is_dir: true },
    { name: 'branches/', href: 'branches/', is_dir: true },
    { name: 'tags/', href: 'tags/', is_dir: true },
    { name: 'trunk/', href: 'trunk/', is_dir: true }
  ])
})
