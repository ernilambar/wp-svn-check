# wp-svn-check

Node.js CLI that checks a WordPress.org plugin's SVN repo for common issues
(missing readme, bad stable tag, missing main plugin file, missing assets).
Fetches directly from `https://plugins.svn.wordpress.org/{slug}/` — no `svn`
binary, no `api.wordpress.org` calls. ESM, Node >=22.

## Architecture

```
bin/cli.js                       # entry point: parse args, run analyzer, render, set exit code
src/lib/slug.js                  # sanitize/validate plugin slug, build base SVN URL
src/lib/fetcher.js               # fetchRaw/fetchDirectory — HTTP layer, never throws
src/lib/html-links.js            # parse <a href> links out of SVN directory listing HTML
src/lib/parse-readme.js          # extract fields from readme.txt/.md
src/lib/parse-plugin-headers.js  # extract fields from the main plugin PHP file's docblock
src/lib/report.js                # fluent report/section/check builder + pass/warn/fail/info summary
src/lib/analyzer.js              # orchestrates fetch+parse into a report
src/lib/exit-code.js             # maps a report to the tiered CI exit code
src/render/terminal.js           # default colored terminal output
src/render/markdown.js           # --format markdown output
test/                            # node:test, mirrors src/ layout; HTTP mocked via undici MockAgent
```

## Exit codes

Tiered so CI can distinguish plugin problems from tool problems:
`0` all pass · `1` has warn · `2` has fail · `3` not_found (no SVN repo) ·
`4` tool error (bad usage, invalid slug, or SVN mirror unreachable).
`not_found` vs `unreachable` is decided by whether any resolve-phase HTTP
request got a real response (see `src/lib/analyzer.js`).

## Conventions

- Lint/format: `standard` (zero-config).
- Tests: `node --test`. No test hits the real SVN mirror.
- Fetch layer never throws — transport failures are returned, not thrown,
  so the analyzer can tell a dead network apart from a real 404.

## Quality gate

All must pass before a task is complete:

- `npm run lint:fix` — auto-fix `standard` violations (run before lint)
- `npm run lint` — zero errors; fix and re-run until clean
- `npm test` — zero failures

On failure: fix, then re-run from that step.
