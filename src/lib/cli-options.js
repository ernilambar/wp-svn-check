import { Command, Option } from 'commander'

/**
 * Parse CLI args (excluding node/script) into { slug, format }. `format` is
 * undefined when --format is omitted. Throws a CommanderError on bad usage
 * (missing slug, unknown --format value) instead of exiting the process.
 */
export function parseArgs (argv) {
  const program = new Command()
    .name('wp-svn-check')
    .argument('<slug>', 'WordPress.org plugin slug')
    .addOption(new Option('--format <format>', 'output format').choices(['json', 'markdown']))
    .exitOverride()
    .configureOutput({ writeOut: () => {}, writeErr: () => {} })

  program.parse(argv, { from: 'user' })

  const [slug] = program.args
  const { format } = program.opts()

  return { slug, format }
}
