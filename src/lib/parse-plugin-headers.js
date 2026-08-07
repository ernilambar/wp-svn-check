const FIELDS = {
  'Plugin Name': /^\s*[/*#]*\s*Plugin Name:\s*(.+)$/im,
  Version: /^\s*[/*#]*\s*Version:\s*(.+)$/im,
  'Requires at least': /^\s*[/*#]*\s*Requires at least:\s*(.+)$/im,
  'Tested up to': /^\s*[/*#]*\s*Tested up to:\s*(.+)$/im,
  'Requires PHP': /^\s*[/*#]*\s*Requires PHP:\s*(.+)$/im,
  Author: /^\s*[/*#]*\s*Author:\s*(.+)$/im
}

/**
 * Port of SVN_Fetcher::parse_plugin_headers() — regex field extraction from
 * the main plugin PHP file's docblock.
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
