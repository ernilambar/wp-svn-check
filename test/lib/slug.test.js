import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeTitle, validateSlug, buildBaseUrl } from '../../src/lib/slug.js'

test('sanitizeTitle lowercases and dashes simple input', () => {
  assert.equal(sanitizeTitle('Hello World'), 'hello-world')
})

test('sanitizeTitle collapses repeated separators and trims dashes', () => {
  assert.equal(sanitizeTitle('  My--Plugin__Name  '), 'my-plugin__name')
})

test('sanitizeTitle converts dots to dashes', () => {
  assert.equal(sanitizeTitle('some.plugin.v2'), 'some-plugin-v2')
})

test('sanitizeTitle strips accents to ASCII', () => {
  assert.equal(sanitizeTitle('Café Déjà'), 'cafe-deja')
})

test('sanitizeTitle strips HTML tags and entities', () => {
  assert.equal(sanitizeTitle('<b>Bold</b> &amp; Plugin'), 'bold-plugin')
})

test('sanitizeTitle already-clean slug is a no-op', () => {
  assert.equal(sanitizeTitle('woocommerce'), 'woocommerce')
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
