# wp-svn-check

CLI to check a WordPress.org plugin's SVN repo for common issues — missing
readme, bad stable tag, missing main plugin file, missing assets, and more.

## Usage

```sh
npx wp-svn-check <slug>
npx wp-svn-check <slug> --format markdown
npx wp-svn-check <slug> --format json
```

`<slug>` is the plugin's WordPress.org slug (e.g. `hello-dolly`), taken from
its `https://wordpress.org/plugins/{slug}/` URL.

## Flags

| Flag | Values | Description |
| --- | --- | --- |
| `--format` | `json`, `markdown` | Output format. Omit for the default colored terminal report. |
| `-h`, `--help` | — | Show usage. |
| `-v`, `--version` | — | Show the installed version. |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All checks passed. |
| `1` | At least one `warn`, no `fail`. |
| `2` | At least one `fail`. |
| `3` | Plugin not found — the slug has no SVN repo on WordPress.org. |
| `4` | Tool error — invalid slug, bad CLI usage, or the mirror was unreachable (DNS/timeout/offline). |

Codes `3` and `4` are deliberately separate so a CI script can tell "the
plugin is broken" from "the run couldn't complete — retry me".

## Requirements

Node.js 22 or later.

## Contributing

```sh
npm install
npm run format     # auto-fix `neostandard` violations
npm run lint       # must be zero errors
npm test           # node --test, no network calls
```

No test hits the real SVN mirror — HTTP is mocked via undici's `MockAgent`.

### Manual Testing

Before opening a PR, verify the key commands against the real CLI:

```bash
node bin/cli.js hello-dolly
node bin/cli.js hello-dolly --format markdown
node bin/cli.js this-slug-does-not-exist
```

## License

[MIT](LICENSE) © 2026 [Nilambar Sharma](https://nilambar.net/)
