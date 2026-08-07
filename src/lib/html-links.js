import { parse } from 'node-html-parser'

/**
 * Extract <a href> entries from an SVN HTTP directory listing page.
 * Mirrors the PHP DOMDocument-based filter: skip empty/parent-dir/anchor/
 * query links and absolute/external URLs, de-duping by href.
 */
export function parseHtmlLinks (html) {
  const doc = parse(html)
  const items = []
  const seen = new Set()

  for (const link of doc.querySelectorAll('a')) {
    const href = link.getAttribute('href') || ''
    const text = link.text.trim()

    if (
      !href ||
      href === '../' ||
      href[0] === '#' ||
      href[0] === '?' ||
      href.includes('://') ||
      seen.has(href)
    ) {
      continue
    }

    seen.add(href)
    items.push({
      name: text || href.replace(/\/+$/, ''),
      href,
      is_dir: href.endsWith('/')
    })
  }

  return items
}
