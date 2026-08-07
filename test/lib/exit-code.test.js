import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeExitCode } from '../../src/lib/exit-code.js'

function report ({ error, pass = 0, warn = 0, fail = 0, info = 0 } = {}) {
  return { meta: { error }, summary: { pass, warn, fail, info } }
}

test('an all-pass report exits 0', () => {
  assert.equal(computeExitCode(report({ pass: 5 })), 0)
})

test('a report with a warn and no fail exits 1', () => {
  assert.equal(computeExitCode(report({ pass: 3, warn: 1 })), 1)
})

test('a report with a fail exits 2', () => {
  assert.equal(computeExitCode(report({ pass: 3, warn: 1, fail: 1 })), 2)
})

test('meta.error not_found exits 3', () => {
  assert.equal(computeExitCode(report({ error: 'not_found' })), 3)
})

test('meta.error unreachable exits 4', () => {
  assert.equal(computeExitCode(report({ error: 'unreachable' })), 4)
})

test('unreachable takes priority over fail/warn counts', () => {
  assert.equal(computeExitCode(report({ error: 'unreachable', fail: 2, warn: 3 })), 4)
})

test('not_found takes priority over fail/warn counts', () => {
  assert.equal(computeExitCode(report({ error: 'not_found', fail: 2, warn: 3 })), 3)
})
