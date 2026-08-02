# Contributing to Plimsoll

Thanks for helping. Two rules matter more than everything else in this file.

## 1. Never guess a selector, endpoint, or text shape

Three earlier attempts at this project failed for one reason: a CSS selector, a text
shape, and an API endpoint were each written from a reasonable assumption. Each looked
correct in review. Each matched nothing at runtime.

So: **no selector, parser, regex, or endpoint may be added unless real captured data
for it exists in `fixtures/`.** If you cannot obtain a capture, the feature ships
visibly `unavailable` rather than as a guess. "This is probably how it works" is the
exact thought that caused all three failures.

Capture procedure: [docs/capture-protocol.md](docs/capture-protocol.md).

## 2. This repository is public, and discovery captures real account data

`fixtures/raw/` holds real spend, balance, org UUIDs, session tokens and conversation
titles. It is gitignored and must stay that way. Committing such a file and deleting it
in a later commit does **not** remove it — the data stays in history forever.

Before any commit that touches `fixtures/`, `docs/`, or `discovery/`:

```bash
pnpm run check:privacy
git status          # confirm nothing under fixtures/raw/ is staged
```

If something does leak: rewrite history with `git-filter-repo`, force-push, and treat
any exposed session token as compromised — sign out of all sessions on that provider.

## Getting set up

```bash
pnpm install
pnpm run verify      # typecheck, lint, format, tests, privacy
```

## Rules the code enforces for you

Several project constraints are lint rules or CI checks rather than conventions, so you
get a failure rather than a review comment:

- `fetch` and `XMLHttpRequest` are banned outside `packages/adapters/`. No telemetry,
  no analytics, no backend.
- `localStorage` is banned. Use the typed `chrome.storage.local` wrapper.
- `setInterval` is banned for layout tracking. Use `ResizeObserver` /
  `IntersectionObserver`.
- `eval` and `new Function` are banned outright.
- `scripts/check-target.ts` fails the build if the `monitor` bundle contains any
  portability code, or if the manifest requests `tabs`, `<all_urls>`, or similar.

## Things that will be declined

- Anything that helps a user continue past a limit: auto-resume, retry-after-cap,
  limit bypass, account rotation. This is an instant Chrome Web Store policy violation
  and the fastest route to removal.
- Copy anywhere — UI, README, listing — implying you can keep going when you hit a limit.
- Defaulting an unknown value to `0`. `null` means unknown and renders `n/a`. A zeroed
  bar is a lie that looks like data.
- Silent fallback between data tiers. Every degradation is visible, with a provenance chip.
- Copying implementation from a GPL/AGPL project. Endpoint paths and response shapes are
  facts and fine to learn from; code is not. Record anything you consulted, and its
  licence, in `discovery/research.md`.
- Adding a permission "for later".

## Style

- TypeScript strict. No `any` without a comment justifying it.
- Small modules, single responsibility. A long file is doing too much.
- Tests before parsers, always. Encode the failure mode first.
- Conventional commit messages, one logical change per commit.

## Testing

```bash
pnpm run test              # unit
pnpm run check:privacy     # PII scan + secret scan
pnpm run build:full && pnpm run check:target full
pnpm run build:monitor && pnpm run check:target monitor
```

A new parser needs three things: a sanitized fixture, a golden snapshot, and a
resilience test proving broken input degrades to `unavailable` rather than throwing or
reporting `0%`.
