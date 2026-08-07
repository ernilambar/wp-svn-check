const FIELDS = {
  stable_tag: /^Stable tag:\s*(.+)$/im,
  requires_at_least: /^Requires at least:\s*(.+)$/im,
  tested_up_to: /^Tested up to:\s*(.+)$/im,
  requires_php: /^Requires PHP:\s*(.+)$/im
}

/**
 * Port of SVN_Fetcher::parse_readme() — regex field extraction from
 * readme.txt/.md content.
 */
export function parseReadme (content) {
  const data = {}

  for (const [key, pattern] of Object.entries(FIELDS)) {
    const match = content.match(pattern)

    if (match) {
      data[key] = match[1].trim()
    }
  }

  const svnHeading = content.match(/^===\s*(.+?)\s*===/m)
  const mdHeading = content.match(/^#\s+(.+)$/m)

  if (svnHeading) {
    data.name = svnHeading[1].trim()
  } else if (mdHeading) {
    data.name = mdHeading[1].trim()
  }

  return data
}
