const STATUS_EMOJI = {
  pass: '✅',
  warn: '⚠️',
  fail: '❌',
  info: 'ℹ️'
}

function escapeCell (value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function formatMetaList (report) {
  const { meta } = report
  const fields = [
    ['Plugin name', meta.plugin_name],
    ['SVN URL', meta.svn_url],
    ['Stable tag', meta.stable_tag],
    ['Trunk version', meta.trunk_version],
    ['Requires PHP', meta.requires_php],
    ['Tested up to', meta.tested_up_to]
  ]

  return fields
    .filter(([, value]) => value != null)
    .map(([label, value]) => `- **${label}:** ${value}`)
    .join('\n')
}

function formatSummary (summary) {
  return `${summary.pass} pass · ${summary.warn} warn · ${summary.fail} fail · ${summary.info} info`
}

function renderSectionTable (section) {
  const lines = [
    `## ${section.label}`,
    '',
    '| Status | Check | Detail |',
    '| --- | --- | --- |'
  ]

  for (const check of section.checks) {
    const emoji = STATUS_EMOJI[check.status]
    lines.push(`| ${emoji} | ${escapeCell(check.label)} | ${escapeCell(check.detail)} |`)
  }

  return lines.join('\n')
}

/**
 * GFM output for --format markdown. Written straight to stdout so the user
 * can pipe/copy it directly (e.g. into a GitHub issue or PR description).
 */
export function renderMarkdown (report) {
  const { meta } = report

  if (meta.error === 'not_found') {
    console.log(`**No SVN repo found for "${report.slug}" (${meta.svn_url})**`)
    return
  }

  if (meta.error === 'unreachable') {
    console.log("**Couldn't reach plugins.svn.wordpress.org (network/timeout) — try again**")
    return
  }

  const lines = [
    `# SVN Check: ${report.slug}`,
    '',
    formatMetaList(report),
    '',
    ...report.sections.flatMap((section) => [renderSectionTable(section), '']),
    formatSummary(report.summary)
  ]

  console.log(lines.join('\n'))
}
