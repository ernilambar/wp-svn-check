const SVN_HOST = 'https://plugins.svn.wordpress.org/'

const SLUG_PATTERN = /^[\w.-]+$/

/**
 * Port of WordPress's sanitize_title() for the common ASCII-dash case.
 * Accented input is handled via Unicode decomposition rather than
 * WordPress's exact remove_accents() table, so it is close but not
 * byte-for-byte identical.
 */
export function sanitizeTitle (input) {
  let title = String(input)

  title = title.replace(/<[^>]*>/g, '')
  title = title.normalize('NFKD').replace(/\p{Mn}/gu, '')
  title = title.toLowerCase()
  title = title.replace(/&.+?;/g, '')
  title = title.replace(/\./g, '-')
  title = title.replace(/[^a-z0-9 _-]/g, '')
  title = title.replace(/\s+/g, '-')
  title = title.replace(/-+/g, '-')
  title = title.replace(/^-+|-+$/g, '')

  return title
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
