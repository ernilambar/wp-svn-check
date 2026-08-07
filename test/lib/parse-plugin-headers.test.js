import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePluginHeaders } from '../../src/lib/parse-plugin-headers.js'

test('parsePluginHeaders extracts Version from a standard docblock', () => {
  const content = `<?php
/**
 * Plugin Name: Hello Dolly
 * Version: 1.7.2
 * Requires PHP: 7.2
 */
`

  assert.deepEqual(parsePluginHeaders(content), {
    Version: '1.7.2'
  })
})

test('parsePluginHeaders returns an empty object when Version is missing', () => {
  const content = `<?php
/**
 * Plugin Name: Hello Dolly
 */
`

  assert.deepEqual(parsePluginHeaders(content), {})
})

test('parsePluginHeaders returns an empty object when no header lines match', () => {
  assert.deepEqual(parsePluginHeaders('<?php\necho "hi";\n'), {})
})

test('parsePluginHeaders matches "#" comment-line prefixes', () => {
  const content = `<?php
# Plugin Name: Hash Style
# Version: 3.0
`

  assert.deepEqual(parsePluginHeaders(content), {
    Version: '3.0'
  })
})

test('parsePluginHeaders matches unprefixed header lines', () => {
  const content = 'Plugin Name: No Comment Prefix\nVersion: 4.0\n'

  assert.deepEqual(parsePluginHeaders(content), {
    Version: '4.0'
  })
})
