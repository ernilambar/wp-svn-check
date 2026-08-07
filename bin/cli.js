#!/usr/bin/env node

import ora from 'ora'
import { parseArgs } from '../src/lib/cli-options.js'
import { sanitizeTitle, validateSlug } from '../src/lib/slug.js'
import { analyze } from '../src/lib/analyzer.js'
import { computeExitCode } from '../src/lib/exit-code.js'
import { renderTerminal } from '../src/render/terminal.js'
import { renderMarkdown } from '../src/render/markdown.js'

async function main () {
  let rawSlug, format

  try {
    ({ slug: rawSlug, format } = parseArgs(process.argv.slice(2)))
  } catch (error) {
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
      process.exit(error.exitCode)
    }
    throw error
  }

  const slug = sanitizeTitle(rawSlug)

  if (!validateSlug(slug)) {
    throw new Error(`Invalid plugin slug: "${rawSlug}"`)
  }

  const spinner = ora(`Analyzing ${slug}...`).start()
  let report

  try {
    report = await analyze(slug)
  } catch (error) {
    spinner.fail(`Failed to analyze ${slug}`)
    throw error
  }

  if (report.meta.error) {
    spinner.fail(`Analysis of ${slug} could not complete`)
  } else {
    spinner.succeed(`Analyzed ${slug}`)
  }

  if (format === 'json') {
    console.log(JSON.stringify(report, null, 2))
  } else if (format === 'markdown') {
    renderMarkdown(report)
  } else {
    renderTerminal(report)
  }

  process.exit(computeExitCode(report))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(4)
})
