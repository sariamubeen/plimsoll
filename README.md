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

**Pre-release.** Both targets build and the extension loads unpacked; it is not yet
published to any store.

Plimsoll is built capture-first: no selector, parser, or API endpoint is written until
real captured data for it exists. Where a signal cannot be read reliably it reads
_"not available on this site"_ rather than showing a plausible-looking number.

### What actually works today

| Signal                     | Claude                 | ChatGPT               | Gemini                |
| -------------------------- | ---------------------- | --------------------- | --------------------- |
| Context estimate           | ✅ `est.`              | ✅ `est.`             | ✅ `est.`             |
| Session / weekly / credits | ✅ from the usage page | ⛔ not available      | ⛔ not available      |
| Limit warning              | detected when present  | detected when present | detected when present |
| Authenticated API read     | ⛔ not implemented     | ⛔ not implemented    | ⛔ not implemented    |
| Conversation export        | ✅ `full` build        | ✅ `full` build       | ✅ `full` build       |

⛔ is a deliberate, visible state, not a bug. OpenAI and Google publish no usage figure
Plimsoll could read, and no API endpoint has been verified against a live capture — so
none is written. See [`docs/endpoints.md`](docs/endpoints.md) and
[`discovery/research.md`](discovery/research.md).

Running [`docs/capture-protocol.md`](docs/capture-protocol.md) is what promotes any of
those. Because capabilities are typed metadata, promotion is a config change plus a
parser, not a redesign.

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
| `full`    | Monitor plus conversation export | identical — no extra permission    |

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
