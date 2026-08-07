# wp-svn-check — Implementation Plan

Node.js CLI port of the Tagfirm plugin's SVN-check feature
(`/Users/nilambar/Web/griha/wp-content/plugins/tagfirm/app/SVN/`).

Usage target: `npx wp-svn-check <plugin-slug> [--format <json|markdown>]`

## Feasibility verdict

**No blockers.** The source plugin never shells out to `svn` and never calls
`api.wordpress.org`. It only does plain HTTPS GETs against
`https://plugins.svn.wordpress.org/{slug}/...` — an Apache directory-listing
mirror of the real SVN repo — then regexes readme.txt / PHP header text. That
maps cleanly onto Node's built-in `fetch` + a small HTML link parser +
`RegExp`. The one soft spot: WordPress's `sanitize_title()` has specific
accent-stripping behavior for slugify; the JS port handles the common
ASCII-dash case exactly and accented input "close enough" rather than
byte-for-byte identical. Not worth blocking on.

## Decisions locked in

- Language: plain JavaScript (ESM). **Min Node version: 22.**
- **Input is a plugin slug only** — the full-SVN-URL branch from the PHP
  constructor is dropped. The host is hard-locked to
  `plugins.svn.wordpress.org`; nothing else is ever fetched. This removes the
  SSRF surface entirely.
- **Untrusted strings are validated before URL interpolation.** The slug, and
  any `stable_tag` / `plugin_file` derived from remote readme/listing content,
  must match `/^[\w.\-]+$/` (no `/`, no `..`, no `://`) before being spliced
  into a fetch path. Anything failing the guard is treated as absent, not
  fetched.
- **Exit codes are tiered** so the tool is usable as a CI gate
  without parsing JSON. Report verdicts and tool failures use **separate**
  codes so a CI script can tell "the plugin is broken" from "the run couldn't
  complete — retry me":
  - `0` — all checks passed
  - `1` — at least one `warn`, no `fail`
  - `2` — at least one `fail`
  - `3` — plugin not found: the slug resolved but WordPress.org returned a real
    HTTP response with no SVN repo (a genuine verdict, not an error)
  - `4` — tool error: bad CLI usage, invalid slug, or a **transport failure**
    (DNS/timeout/offline/5xx) that prevented a report from completing.
    Distinct from `3` on purpose — a network blip must never masquerade as a
    real "not found" verdict.
- **Transport failure ≠ not-found.** `fetchRaw` distinguishes a real HTTP
  response (any status, incl. 404) from a transport-level failure
  (DNS/timeout/connection/5xx). `not_found` (exit `3`) is only reported when
  the resolve-phase requests returned *real* HTTP responses that were all
  non-200. If **every** resolve-phase request failed at the transport layer,
  that is a tool error (exit `4`), never `not_found`. See Phase 1 (fetcher)
  and Phase 4 (analyzer bail-out) for the mechanics.
- **No caching**, unlike the PHP plugin's 30-minute transient — every run
  fetches live data. Simpler, and correct for a one-shot CLI. No `--fresh`
  flag needed since there's nothing to bypass.
- **Unit tests are required, with proper HTTP mocking** — no test hits the
  real `plugins.svn.wordpress.org` mirror. Use Node's built-in `node --test`
  runner plus `undici`'s `MockAgent` to intercept `fetch` at the HTTP layer
  (Node's global `fetch` is undici-backed, so this mocks realistically without
  a manual monkeypatch). Tests are written alongside each phase below, not
  deferred to the end.
- **Linting + formatting: `standard`** (npm package). No ESLint/Prettier
  config to maintain — `standard` is opinionated and zero-config. `standard
  --fix` covers formatting.
- **Spinner**: analysis issues several sequential HTTP requests
  (readme fallback chain, trunk listing, PHP file probing, tags check, assets
  listing, then the same again for the stable-tag section) and can take a few
  seconds. Use `ora` to show a spinner while the analyzer runs, so the CLI
  doesn't look hung.
- **GitHub Actions**: `lint.yml` and `test.yml` at minimum, running on push
  and PR against Node 22.

## Architecture

```
bin/cli.js                       # shebang entry, arg parsing, spinner, dispatch
src/lib/slug.js                  # sanitizeTitle(), validateSlug(), buildBaseUrl()
src/lib/fetcher.js               # fetchRaw(), fetchDirectory() over global fetch
src/lib/html-links.js            # parse <a href> items out of a directory listing page
src/lib/parse-readme.js          # regex field extraction from readme.txt/.md
src/lib/parse-plugin-headers.js  # regex field extraction from main PHP file
src/lib/report.js                # report builder + summary aggregation
src/lib/analyzer.js              # orchestrates all checks, port of SVN_Analyzer::run()
src/render/terminal.js           # default colored terminal output
src/render/markdown.js           # --markdown flag output
test/*.test.js                   # node:test files, one per src module, mirroring src/ layout
.github/workflows/lint.yml
.github/workflows/test.yml
```

Data shape (same as the PHP `Report`/`Section`/`Check_Item`, so behavior stays
directly comparable to the existing plugin):

```js
{
  slug: 'woocommerce',
  meta: { plugin_name, plugin_file, stable_tag, trunk_version, requires_php, tested_up_to, svn_url },
  summary: { pass, warn, fail, info },
  sections: [
    { id, label, summary: { pass, warn, fail, info }, checks: [ { label, status, detail } ] }
  ]
}
```

On a not-found slug: `{ slug, meta: { error: 'not_found', svn_url }, summary: {}, sections: [] }`.
On an unreachable mirror (transport failure): `{ slug, meta: { error: 'unreachable', svn_url }, summary: {}, sections: [] }`.
The renderers print a distinct message per `error` value; the CLI maps
`not_found` → exit `3` and `unreachable` → exit `4`.

---

## Phase 0 — Project scaffolding & tooling

- `package.json`: `type: module`, `engines.node: ">=22"`, `bin` field pointing
  at `bin/cli.js`, scripts:
  - `"test": "node --test"`
  - `"lint": "standard"`
  - `"lint:fix": "standard --fix"`
- Dependencies: `commander` (arg parsing), `chalk` (color), `ora` (spinner).
- Dev dependencies: `standard`, `undici` (only needed explicitly if not
  already satisfied by Node's bundled version — used for `MockAgent` in
  tests).
- `bin/cli.js`: shebang stub (`#!/usr/bin/env node`), wired up in later phases.
- `.github/workflows/lint.yml`: on `push`/`pull_request`, Node 22, `npm ci` +
  `npm run lint`.
- `.github/workflows/test.yml`: on `push`/`pull_request`, Node 22, `npm ci` +
  `npm test`.

## Phase 1 — Fetch layer (+ tests)

- `sanitizeTitle(input)` + `validateSlug(slug)`: slugify the raw input via the
  `sanitize_title()` port, then require it to match `/^[\w.\-]+$/`. An empty or
  non-conforming result is a CLI usage error (exit `4`, per the tiered scheme).
- `buildBaseUrl(slug)`: `https://plugins.svn.wordpress.org/{slug}/`. The host is
  a hard-coded constant — never derived from input. No full-URL branch.
- Any `stable_tag` / `plugin_file` sourced from remote content passes the same
  `/^[\w.\-]+$/` guard before it is interpolated into a `tags/{...}/` fetch path;
  a value that fails the guard is treated as absent (check reports missing).
- `fetchRaw(baseUrl, relativePath)`: GET, timeout via `AbortController`
  (20s, matching the PHP `wp_remote_get` timeout). **Never throws.** Returns
  `{ code, body, transportError }`:
  - a real HTTP response → `{ code: <status>, body, transportError: false }`
    (this includes 404, 403, 500 — the server *answered*).
  - a transport-level failure (DNS, connection refused, timeout/`AbortError`,
    socket reset) → `{ code: 0, body: '', transportError: true }`.
  - This split is the whole basis of the exit-`3`-vs-`4` distinction; the PHP
    original collapsed both into `code: 0`, which is the bug being fixed.
    5xx is treated as a transport failure for bail-out purposes too (the mirror
    is up but not answering usefully) — normalize 5xx to `transportError: true`.
- `fetchDirectory(baseUrl, relativePath)`: `fetchRaw` + parse HTML links.
  Returns `{ exists, items, transportError }` (propagates the flag so the
  analyzer can tell "listing 404" from "couldn't reach the mirror").
- `parseHtmlLinks(html)`: extract `<a href>` entries as
  `{ name, href, is_dir }`, skipping `../`, `#...`, `?...` (mod_autoindex sort
  links), absolute/external `://` URLs, and de-duping by href — same filter
  rules as the PHP `DOMDocument` version. Use a small HTML parser
  (e.g. `node-html-parser`, zero transitive deps) rather than hand-rolled
  regex, since this is real HTML and regex-only parsing is fragile against
  markup quirks.

**Tests**: use `undici.MockAgent` to intercept `https://plugins.svn.wordpress.org`
requests — cover a 200 file fetch, a 404 (assert `transportError: false`), a
network error and a timeout/`AbortError` (assert `code: 0, transportError:
true`), a 500 (assert it normalizes to `transportError: true`), and a
directory listing parsed from a captured real response body (e.g. saved from
`https://plugins.svn.wordpress.org/hello-dolly/`) to confirm the link filter
matches the PHP version's behavior exactly.

## Phase 2 — Content parsers (+ tests)

Direct 1:1 port of `SVN_Fetcher::parse_readme()` and
`SVN_Fetcher::parse_plugin_headers()` — both are pure regex, no PHP-specific
behavior:

- `parseReadme(content)` → `{ stable_tag, requires_at_least, tested_up_to, requires_php, name }`
- `parsePluginHeaders(content)` → `{ 'Plugin Name', Version, 'Requires at least', 'Tested up to', 'Requires PHP', Author }`

Use the exact same regex patterns (`/im` flags), just as JS `RegExp` literals.

**Tests**: fixture strings covering — all fields present, missing fields,
readme.txt-style `===Name===` vs markdown `# Name` fallback, and PHP header
docblocks with `*`/`#` comment-line prefixes.

## Phase 3 — Report builder (+ tests)

Port `Report_Builder` / `Report` / `Section` / `Check_Item` as plain objects +
factory functions (no classes needed):

- `createReportBuilder(slug)` with `.meta(obj)`, `.section(id, label)`,
  `.check(label, status, detail)`, `.build()`.
- Summary aggregation: per-section counts of `pass|warn|fail|info`, then
  summed into the top-level `summary`.

**Tests**: verify summary counts roll up correctly across multiple sections
and multiple checks per status.

## Phase 4 — Analyzer (+ tests)

Port `SVN_Analyzer::run()` step-by-step, preserving the exact check order,
labels, and pass/warn/fail/info logic (see verified inventory below). Key
behaviors to preserve:

- Readme fallback chain: `trunk/readme.txt` → `README.txt` → `readme.md` →
  `README.md`, first HTTP 200 wins.
- **Resolve-phase bail-out (the exit-3-vs-4 fix).** After the readme fallback
  chain + the `trunk/` listing fetch:
  - `trunk_exists = trunk/ listing 200 OR any readme fetch was 200`.
  - If `trunk_exists` → proceed normally.
  - Else, inspect whether *any* resolve-phase request came back with a real
    HTTP response (`transportError: false`):
    - **At least one real response, all non-200** → genuine `not_found`. Bail
      with `meta.error = 'not_found'`, no further requests. (CLI → exit `3`.)
    - **Every resolve-phase request was a transport failure** → the mirror was
      unreachable, not the plugin missing. Bail with `meta.error =
      'unreachable'`. (CLI → exit `4`.) Do NOT report `not_found`.
  - The PHP original had no `unreachable` branch — a dead network silently
    became `not_found`. This is the ported bug being corrected.
- Main plugin file discovery: scan trunk listing for `.php` files (excluding
  `uninstall.php`), try `{slug}.php` first then the rest in listing order,
  fetch each and accept the first whose body contains the literal
  `Plugin Name:`.
- Each directory (`trunk/`, `assets/`) is fetched exactly once and reused
  across checks — preserve this to keep request count low.
- `stable_tag` section is only emitted if a stable tag was declared in trunk's
  readme; its sub-checks (readme/version-in-tag) are further conditional on
  the tag existing / its readme or PHP file being found.

### Full check inventory to port (17 possible checks)

**Section `root` — "Main SVN Folder"**
1. `trunk/ exists` — pass/fail
2. `tags/ exists` — pass/fail
3. `assets/ exists` — pass/**warn** (optional)

**Section `trunk` — "Trunk"**
4. `readme.txt found` — pass/fail
5. `Stable tag declared` — pass/fail
6. `Main plugin PHP file found` — pass/**warn**
7. `Version declared in PHP header` — pass / fail (file found, no Version) / **warn** (no file found at all)
8. `Stable tag matches PHP version` — pass/fail if both present, else **warn** "Cannot compare"

**Section `stable_tag` — label `tags/{stable_tag}/`** (only if stable tag declared)
9. `tags/{stable_tag}/ exists` — pass/fail
   — if tag exists and plugin file known:
10. `readme.txt found` (in tag) — pass/fail
11. `Stable tag declared` (in tag readme) — pass/fail
12. `readme stable tag matches trunk` — pass/fail (only emitted if both values present, no warn branch)
13. `Main PHP file found` (in tag) — pass/fail
14. `Version declared` (in tag PHP file) — pass/fail
15. `PHP version matches trunk` — pass/fail (only emitted if both present)

**Section `assets` — "Assets"** (always emitted)
16. `Banner image present` — regex `/^banner-\d+x\d+\.(png|jpg)$/i` — pass/**info**
17. `Icon image present` — regex `/^icon(-\d+x\d+\.(png|jpg)|\.svg)$/i` — pass/**info**

**Tests**: use `MockAgent` to simulate whole-repo scenarios end-to-end —
nonexistent slug (all 404s → `meta.error === 'not_found'`), **mirror
unreachable (all resolve-phase requests transport-fail → `meta.error ===
'unreachable'`, asserting it is NOT `not_found`)**, healthy plugin (all pass),
missing `assets/` (warn), missing main PHP file (warn cascade),
stable-tag/version mismatch (fail), stable tag declared but the tag folder
itself 404s, and a **malicious `Stable tag: ../../foo` that the guard rejects**
(check reports missing, no traversing fetch is issued). Assert the exact
resulting `sections`/`summary`/`meta.error` shape for each scenario.

## Phase 5 — CLI entry, argument parsing, spinner

`bin/cli.js`:

- Positional `<slug>` (required) — plugin slug (slugified + validated).
- `--format <json|markdown>` — opt out of the default terminal output. Omitted
  → colored terminal render (the default has no name, `kubectl -o` style).
  `markdown` = copy-pasteable GFM; `json` = raw report dump for scripting. Exit
  code is set per the tiered scheme regardless of format.
  `commander`'s `.choices(['json', 'markdown'])` rejects unknown values.
- `commander` for parsing (handles `--help`/usage text for free).
- `ora` spinner (e.g. "Analyzing {slug}...") active for the duration of
  `analyze()`, since it's several sequential requests and can take a few
  seconds; `succeed()`/`fail()` on completion. Ora writes to stderr, so stdout
  stays clean for `--format json`/`markdown` piping.
- After rendering, compute the exit code from `report.summary` /
  `report.meta.error`, checked in this order:
  - `4` if `meta.error === 'unreachable'` (transport failure)
  - `3` if `meta.error === 'not_found'`
  - `2` if `summary.fail > 0`
  - `1` if `summary.warn > 0`
  - else `0`
- Top-level try/catch: genuine tool errors (invalid slug, bad usage, uncaught
  exception) print to stderr and exit `4` — **not `3`**. Exit `3` is reserved
  for the real `not_found` verdict so CI can distinguish the two.

**Tests**: unit-test the option-parsing in isolation (given argv, expect
parsed `{ slug, format }` where `format` is `undefined` when the flag is
omitted; reject an invalid `--format` value), and unit-test
the exit-code mapping function directly against fixture report objects
(all-pass → 0, has-warn → 1, has-fail → 2, `meta.error === 'not_found'` → 3,
`meta.error === 'unreachable'` → 4). No automated test spawns the real CLI
binary against the network — that's covered by Phase 4's analyzer tests plus
manual smoke testing in Phase 8.

## Phase 6 — Terminal renderer (+ tests)

`src/render/terminal.js`:

- Header: plugin name + slug + svn_url.
- Meta line: stable tag / trunk version / requires PHP / tested up to.
- Per section: colored status glyph (green ✔ pass, yellow ⚠ warn, red ✖ fail,
  blue ℹ info) + check label + detail, as an aligned table (manual column
  padding + `chalk`, no extra table-drawing dependency needed for 3 columns).
- Footer: summary counts, e.g. `12 pass · 1 warn · 0 fail · 2 info`.
- Error cases (no table): `not_found` → single red "no SVN repo for {slug}"
  line; `unreachable` → single red "couldn't reach plugins.svn.wordpress.org
  (network/timeout)" line. Distinct wording so the user knows whether to retry.

**Tests**: feed a fixture report object through the renderer, strip ANSI
codes, assert the expected labels/details/summary counts appear in the
output.

## Phase 7 — Markdown renderer (+ tests)

`src/render/markdown.js`:

- `# SVN Check: {slug}` heading.
- Meta as a short bullet list.
- Each section as `## {label}` + a GFM table with columns
  `Status | Check | Detail`, using emoji per status (✅ pass, ⚠️ warn, ❌ fail,
  ℹ️ info — same emoji convention as the plugin's public virtual page).
- Summary line at the bottom.
- Error cases: `not_found` / `unreachable` render as a single bold line with
  the same distinct wording as the terminal renderer, no tables.
- Written straight to stdout so the user can pipe/copy it directly (e.g. into
  a GitHub issue or PR description).

**Tests**: feed the same fixture report object through the renderer, assert
correct GFM table structure and emoji-per-status mapping.

## Phase 8 — Polish, docs, publish prep

- `package.json`: `files` whitelist, repository/license/keywords for npm
  publish.
- `README.md`: usage, flags, sample output for both render modes.
- Friendly error messages for: invalid slug format, DNS/network failure,
  request timeout.
- Manual smoke test (not part of the automated suite, real network) against a
  handful of real plugin slugs: one healthy plugin, one with no `assets/`,
  one with a stable-tag/version mismatch, one nonexistent slug — compare
  output against the existing plugin's public virtual page
  (`/?tgfm_slug={slug}`) for parity.
