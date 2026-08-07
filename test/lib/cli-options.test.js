import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs } from '../../src/lib/cli-options.js'

test('parseArgs returns the slug with format undefined when --format is omitted', () => {
  assert.deepEqual(parseArgs(['hello-dolly']), { slug: 'hello-dolly', format: undefined })
})

test('parseArgs accepts --format json', () => {
  assert.deepEqual(parseArgs(['hello-dolly', '--format', 'json']), { slug: 'hello-dolly', format: 'json' })
})

test('parseArgs accepts --format markdown', () => {
  assert.deepEqual(parseArgs(['hello-dolly', '--format', 'markdown']), { slug: 'hello-dolly', format: 'markdown' })
})

test('parseArgs rejects an unknown --format value', () => {
  assert.throws(() => parseArgs(['hello-dolly', '--format', 'yaml']))
})

test('parseArgs rejects a missing slug argument', () => {
  assert.throws(() => parseArgs([]))
})
