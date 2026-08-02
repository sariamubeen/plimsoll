# Endpoints

## Status: no API endpoint is implemented

Plimsoll's tier-1 data strategy — an authenticated same-origin `fetch` — is **not
implemented for any site**, because no endpoint has been verified against a live
capture.

This document exists to record that absence deliberately, and to make promoting an
endpoint a mechanical process rather than a judgement call.

| Site              | Tier 1 (API)      | Tier 2 (usage page)  | Tier 3 (DOM estimate) |
| ----------------- | ----------------- | -------------------- | --------------------- |
| claude.ai         | ✖ not implemented | ✅ `/settings/usage` | ✅                    |
| chatgpt.com       | ✖ not implemented | ✖ none known         | ✅                    |
| gemini.google.com | ✖ not implemented | ✖ none known         | ✅                    |

## The open lead

Two independent third-party extensions require the user to supply an **Organization
ID** (`lugia19/Claude-Usage-Extension`, GPL-3.0, facts only; `oov/claude-usage-monitor`,
MIT — see `discovery/research.md` §4). A client needs an org UUID for exactly one
reason: to build a URL. That points at something shaped like:

```
/api/organizations/{org_uuid}/…
```

**This path is not in the codebase and must not be added from this document.** It is a
lead. Attempt #3 failed by writing an endpoint pattern that looked right and never
matched a single request.

## Promotion checklist

An endpoint may be written into code only when every box is ticked (PROMPT §4.1):

- [ ] Path observed in a real capture from your own session — not merely in a
      third-party repo
- [ ] HTTP method, status code and content-type recorded
- [ ] Full response body captured to `fixtures/raw/<site>/` and sanitized
- [ ] A zod schema written from the real body, with **every field optional unless
      observed in ≥2 separate captures**
- [ ] Signed-out behaviour recorded (expect 401/403)
- [ ] This file updated with path, shape, date observed, and how to re-run discovery
      when it breaks

Capture procedure: [capture-protocol.md](capture-protocol.md), step 2.

## What changes when an endpoint is confirmed

Very little, by design. `SiteConfig` in `packages/adapters/site-adapter.ts` already has
a `usagePage` tier-2 hook; tier 1 slots in beside it the same way. The capability
matrix is typed data, so flipping a signal from unavailable to available is a config
edit plus a parser — not a redesign.

The etiquette rules in `packages/adapters/etiquette.ts` are already written and tested
and apply the moment a real fetch exists: 60-second floor, cross-tab single-flight,
`Retry-After` honoured verbatim, exponential backoff with jitter, 15-minute circuit
break, never polling a hidden tab.

## Why the rules are strict

Tier 1 would hit an **undocumented** endpoint using the user's own authenticated
session. Anthropic publishes no consumer usage API (`discovery/research.md` §2.4), so
anything found is unsupported and may change without notice. Misbehaving here does not
inconvenience a vendor — it makes a normal person look like an abuser of their own
account.
