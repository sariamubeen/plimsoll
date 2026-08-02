# Plimsoll

Named for the load line on a ship's hull — the mark showing how heavily it can safely
be loaded.

Plimsoll shows you how much of your AI chat allowance you have used, inline on the page:
context-window consumption, session and weekly limits, and credit spend.

> **Plimsoll is read-only. It reports usage; it never modifies, bypasses, or extends any
> provider's limits.**

Works with claude.ai, chatgpt.com and gemini.google.com.

---

## Status

**Pre-release — Phase 0 (discovery).** Not yet installable.

Plimsoll is being built capture-first: no selector, parser, or API endpoint is written
until real captured data for it exists. Where a signal cannot be read reliably, it is
shown as _"not available on this site"_ rather than as a plausible-looking number.
See [`discovery/research.md`](discovery/research.md) for what is confirmed so far.

## Principles

**Read-only, always.** Plimsoll never sends a message, retries a request, rotates an
account, or does anything to help you continue past a limit. It reports; it does not act.

**No number is invented.** Providers do not publish exact consumer usage formulas.
Where there is no real figure, the bar reads `n/a`. An unknown value is never rendered
as `0%` — a zeroed bar is a lie that looks like data.

**Every reading shows where it came from.** Each bar carries a provenance chip — `live`,
`page`, `est.` or `n/a` — and dims when stale. A cached number never looks live.

**No telemetry, no analytics, no backend.** Plimsoll collects nothing and transmits
nothing. The only network requests it makes are to the provider you are already signed
into, from the page you are already on. All state lives in `chrome.storage.local`.

**Your conversation is your data.** The full build can export a conversation to
Markdown, JSON or plain text so you can take it with you. Always user-initiated, one
conversation at a time, never automatic.

## Two builds

| Build     | Contains                         | Permissions                        |
| --------- | -------------------------------- | ---------------------------------- |
| `monitor` | Usage bars only                  | `storage` + three host permissions |
| `full`    | Monitor plus conversation export | adds `scripting` if required       |

Portability is tree-shaken out of `monitor` entirely, and CI fails if any portability
symbol reaches that bundle. Dead code in the bundle still counts as shipped code.

## Privacy

Plimsoll has no server. It collects no data, sends no analytics, and contains no
third-party SDKs. See [PRIVACY.md](PRIVACY.md).

Contributors: this repository is public and its fixtures are generated from real
accounts. Read [`docs/capture-protocol.md`](docs/capture-protocol.md) before capturing
anything, and never commit a file from `fixtures/raw/`.

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run check:privacy   # required before any commit touching fixtures/, docs/, discovery/
```

## Licence

[MIT](LICENSE). Plimsoll is an independent project and is not affiliated with,
endorsed by, or sponsored by Anthropic, OpenAI, or Google.
