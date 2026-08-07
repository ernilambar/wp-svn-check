import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSlug, validateSlug, buildBaseUrl } from '../../src/lib/slug.js'

test('normalizeSlug trims surrounding whitespace', () => {
  assert.equal(normalizeSlug('  hello-dolly  '), 'hello-dolly')
})

test('normalizeSlug strips a trailing slash', () => {
  assert.equal(normalizeSlug('hello-dolly/'), 'hello-dolly')
})

test('normalizeSlug already-clean slug is a no-op', () => {
  assert.equal(normalizeSlug('woocommerce'), 'woocommerce')
})

test('validateSlug accepts word chars, dots and dashes', () => {
  assert.equal(validateSlug('hello-dolly'), true)
  assert.equal(validateSlug('my_plugin.v2'), true)
})

test('validateSlug rejects empty string', () => {
  assert.equal(validateSlug(''), false)
})

test('validateSlug rejects path traversal and slashes', () => {
  assert.equal(validateSlug('../../foo'), false)
  assert.equal(validateSlug('foo/bar'), false)
})

test('validateSlug rejects scheme-like input', () => {
  assert.equal(validateSlug('https://evil.example'), false)
})

test('buildBaseUrl hard-locks the WordPress.org SVN host', () => {
  assert.equal(buildBaseUrl('hello-dolly'), 'https://plugins.svn.wordpress.org/hello-dolly/')
})
