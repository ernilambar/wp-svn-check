import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici'
import { fetchRaw, fetchDirectory } from '../../src/lib/fetcher.js'

const BASE_URL = 'https://plugins.svn.wordpress.org/hello-dolly/'

function withMockAgent (t) {
  const originalDispatcher = getGlobalDispatcher()
  const agent = new MockAgent()
  agent.disableNetConnect()
  setGlobalDispatcher(agent)

  t.after(() => setGlobalDispatcher(originalDispatcher))

  return agent.get('https://plugins.svn.wordpress.org')
}

test('fetchRaw returns a real 200 response', async (t) => {
  withMockAgent(t)
    .intercept({ path: '/hello-dolly/readme.txt', method: 'GET' })
    .reply(200, '=== Hello Dolly ===')

  const result = await fetchRaw(BASE_URL, 'readme.txt')

  assert.deepEqual(result, { code: 200, body: '=== Hello Dolly ===', transportError: false })
})

test('fetchRaw returns a real 404 response, not a transport error', async (t) => {
  withMockAgent(t)
    .intercept({ path: '/hello-dolly/missing.txt', method: 'GET' })
    .reply(404, 'Not Found')

  const result = await fetchRaw(BASE_URL, 'missing.txt')

  assert.equal(result.code, 404)
  assert.equal(result.transportError, false)
})

test('fetchRaw treats a network error as a transport failure', async (t) => {
  withMockAgent(t)
    .intercept({ path: '/hello-dolly/readme.txt', method: 'GET' })
    .replyWithError(new Error('connection refused'))

  const result = await fetchRaw(BASE_URL, 'readme.txt')

  assert.deepEqual(result, { code: 0, body: '', transportError: true })
})

test('fetchRaw treats a timeout/AbortError as a transport failure', async (t) => {
  withMockAgent(t)
    .intercept({ path: '/hello-dolly/readme.txt', method: 'GET' })
    .replyWithError(Object.assign(new Error('aborted'), { name: 'AbortError' }))

  const result = await fetchRaw(BASE_URL, 'readme.txt')

  assert.deepEqual(result, { code: 0, body: '', transportError: true })
})

test('fetchRaw normalizes a 500 response to a transport failure', async (t) => {
  withMockAgent(t)
    .intercept({ path: '/hello-dolly/readme.txt', method: 'GET' })
    .reply(500, 'Internal Server Error')

  const result = await fetchRaw(BASE_URL, 'readme.txt')

  assert.equal(result.code, 500)
  assert.equal(result.transportError, true)
})

test('fetchDirectory reports existence and parses links on 200', async (t) => {
  withMockAgent(t)
    .intercept({ path: '/hello-dolly/', method: 'GET' })
    .reply(200, '<a href="../">..</a><a href="trunk/">trunk/</a>')

  const result = await fetchDirectory(BASE_URL, '')

  assert.deepEqual(result, {
    exists: true,
    items: [{ name: 'trunk/', href: 'trunk/', is_dir: true }],
    transportError: false
  })
})

test('fetchDirectory reports non-existence on a 404 listing', async (t) => {
  withMockAgent(t)
    .intercept({ path: '/hello-dolly/nope/', method: 'GET' })
    .reply(404, 'Not Found')

  const result = await fetchDirectory(BASE_URL, 'nope/')

  assert.deepEqual(result, { exists: false, items: [], transportError: false })
})

test('fetchDirectory propagates transportError from a network failure', async (t) => {
  withMockAgent(t)
    .intercept({ path: '/hello-dolly/trunk/', method: 'GET' })
    .replyWithError(new Error('connection refused'))

  const result = await fetchDirectory(BASE_URL, 'trunk/')

  assert.deepEqual(result, { exists: false, items: [], transportError: true })
})
