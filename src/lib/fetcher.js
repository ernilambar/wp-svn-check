import { parseHtmlLinks } from './html-links.js'

const TIMEOUT_MS = 20000

/**
 * GET a file relative to baseUrl. Never throws.
 *
 * Distinguishes a real HTTP response (any status, including 404/403) from
 * a transport-level failure (DNS, connection refused, timeout, socket
 * reset). 5xx is normalized to transportError: true as well, since the
 * mirror answered but not usefully.
 */
export async function fetchRaw (baseUrl, relativePath) {
  const url = baseUrl + relativePath.replace(/^\/+/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    const body = await response.text()

    return {
      code: response.status,
      body,
      transportError: response.status >= 500
    }
  } catch {
    return { code: 0, body: '', transportError: true }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchDirectory (baseUrl, relativePath) {
  const { code, body, transportError } = await fetchRaw(baseUrl, relativePath)
  const exists = code === 200 && !transportError

  return {
    exists,
    items: exists ? parseHtmlLinks(body) : [],
    transportError
  }
}
