import chalk from 'chalk'

const GLYPHS = {
  pass: chalk.green('✔'),
  warn: chalk.yellow('⚠'),
  fail: chalk.red('✖'),
  info: chalk.blue('ℹ')
}

function formatMeta (meta) {
  const fields = [
    ['Stable tag', meta.stable_tag],
    ['Trunk version', meta.trunk_version],
    ['Requires PHP', meta.requires_php],
    ['Tested up to', meta.tested_up_to]
  ]

  return fields.map(([label, value]) => `${label}: ${value ?? '—'}`).join('  ·  ')
}

function formatSummary (summary) {
  return `${summary.pass} pass · ${summary.warn} warn · ${summary.fail} fail · ${summary.info} info`
}

function renderSections (sections) {
  const labelWidth = Math.max(
    0,
    ...sections.flatMap((section) => section.checks.map((check) => check.label.length))
  )

  const lines = []

  for (const section of sections) {
    lines.push('')
    lines.push(chalk.bold.underline(section.label))

    for (const check of section.checks) {
      const glyph = GLYPHS[check.status]
      const label = check.label.padEnd(labelWidth)
      const detail = check.detail ? `  ${chalk.dim(check.detail)}` : ''
      lines.push(`  ${glyph}  ${label}${detail}`)
    }
  }

  return lines
}

/**
 * Default colored terminal output. Writes straight to stdout.
 */
export function renderTerminal (report) {
  const { meta } = report

  if (meta.error === 'not_found') {
    console.log(chalk.red(`No SVN repo found for "${report.slug}" (${meta.svn_url})`))
    return
  }

  if (meta.error === 'unreachable') {
    console.log(chalk.red("Couldn't reach plugins.svn.wordpress.org (network/timeout) — try again"))
    return
  }

  const lines = [
    `${chalk.bold(meta.plugin_name || report.slug)} ${chalk.dim(`(${report.slug})`)}`,
    chalk.dim(meta.svn_url),
    formatMeta(meta),
    ...renderSections(report.sections),
    '',
    formatSummary(report.summary)
  ]

  console.log(lines.join('\n'))
}
