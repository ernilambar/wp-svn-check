const FIELDS = {
  Version: /^\s*[/*#]*\s*Version:\s*(.+)$/im,
  'Requires Plugins': /^\s*[/*#]*\s*Requires Plugins:\s*(.+)$/im
}

/**
 * Regex field extraction from the main plugin PHP file's docblock.
 */
export function parsePluginHeaders (content) {
  const data = {}

  for (const [key, pattern] of Object.entries(FIELDS)) {
    const match = content.match(pattern)

    if (match) {
      data[key] = match[1].trim()
    }
  }

  return data
}
