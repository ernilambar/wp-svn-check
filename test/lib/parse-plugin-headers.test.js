import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePluginHeaders } from '../../src/lib/parse-plugin-headers.js'

test('parsePluginHeaders extracts all fields from a standard docblock', () => {
  const content = `<?php
/**
 * Plugin Name: Hello Dolly
 * Version: 1.7.2
 * Requires at least: 5.5
 * Tested up to: 6.6
 * Requires PHP: 7.2
 * Author: Matt Mullenweg
 */
`

  assert.deepEqual(parsePluginHeaders(content), {
    'Plugin Name': 'Hello Dolly',
    Version: '1.7.2',
    'Requires at least': '5.5',
    'Tested up to': '6.6',
    'Requires PHP': '7.2',
    Author: 'Matt Mullenweg'
  })
})

test('parsePluginHeaders omits fields that are missing', () => {
  const content = `<?php
/**
 * Plugin Name: Hello Dolly
 */
`

  assert.deepEqual(parsePluginHeaders(content), {
    'Plugin Name': 'Hello Dolly'
  })
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
    'Plugin Name': 'Hash Style',
    Version: '3.0'
  })
})

test('parsePluginHeaders matches unprefixed header lines', () => {
  const content = 'Plugin Name: No Comment Prefix\nVersion: 4.0\n'

  assert.deepEqual(parsePluginHeaders(content), {
    'Plugin Name': 'No Comment Prefix',
    Version: '4.0'
  })
})
