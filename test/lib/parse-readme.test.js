import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseReadme } from '../../src/lib/parse-readme.js'

test('parseReadme extracts all fields from a readme.txt-style header', () => {
  const content = `=== Hello Dolly ===
Stable tag: 1.7.2
Requires at least: 5.5
Tested up to: 6.6
Requires PHP: 7.2

Description text here.
`

  assert.deepEqual(parseReadme(content), {
    stable_tag: '1.7.2',
    requires_at_least: '5.5',
    tested_up_to: '6.6',
    requires_php: '7.2',
    name: 'Hello Dolly'
  })
})

test('parseReadme omits fields that are missing', () => {
  const content = `=== Hello Dolly ===
Stable tag: 1.7.2
`

  assert.deepEqual(parseReadme(content), {
    stable_tag: '1.7.2',
    name: 'Hello Dolly'
  })
})

test('parseReadme returns an empty object for content with no recognized fields', () => {
  assert.deepEqual(parseReadme('Just some plain text.'), {})
})

test('parseReadme reads the name from a readme.txt-style === heading', () => {
  const content = '=== My Plugin ===\nStable tag: 2.0\n'

  assert.equal(parseReadme(content).name, 'My Plugin')
})

test('parseReadme falls back to a markdown # heading when no === heading exists', () => {
  const content = '# My Plugin\n\nStable tag: 2.0\n'

  assert.equal(parseReadme(content).name, 'My Plugin')
})

test('parseReadme prefers the === heading over a markdown heading when both exist', () => {
  const content = '=== SVN Name ===\n# Markdown Name\n'

  assert.equal(parseReadme(content).name, 'SVN Name')
})
