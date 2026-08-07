const SVN_HOST = 'https://plugins.svn.wordpress.org/'

const SLUG_PATTERN = /^[\w.-]+$/

/**
 * Trim whitespace and a trailing slash (e.g. copy-pasted from a
 * https://wordpress.org/plugins/{slug}/ URL) before validation.
 */
export function normalizeSlug (input) {
  return String(input).trim().replace(/\/+$/, '')
}

export function validateSlug (slug) {
  return typeof slug === 'string' && slug.length > 0 && SLUG_PATTERN.test(slug)
}

/**
 * Guard for untrusted strings (stable_tag, plugin_file) sourced from remote
 * readme/listing content before they are spliced into a fetch path.
 */
export function isSafeSegment (value) {
  return typeof value === 'string' && SLUG_PATTERN.test(value)
}

export function buildBaseUrl (slug) {
  return `${SVN_HOST}${slug}/`
}
