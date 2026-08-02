# Chrome Web Store listing — `monitor` build

Submit the **`monitor`** build first. It is the lean, obviously-compliant listing; the
`full` build (adding conversation export) is a separate listing submitted only after
`monitor` is approved. First submissions from a new developer account typically take
7–14 days while Google establishes account trust, so a narrow first listing matters.

---

## Single purpose

> Plimsoll shows you how much of your AI chat usage allowance you have consumed,
> displayed inline on the page you are already using.

That is the whole extension. It reads usage; it does not act.

## Short description (132 char limit)

> See your AI chat usage at a glance — context, session and limit usage, shown inline.
> Read-only, no account, no tracking.

## Detailed description

> Plimsoll shows how much of your AI chat allowance you have used, without leaving the
> page.
>
> • Context usage for the current conversation
> • Session, weekly and credit usage on Claude, read from Anthropic's own usage page
> • A clear "not available" where a site does not publish a figure — never a fake zero
> • Every reading is labelled with where it came from, and dims when it goes stale
>
> **Plimsoll is read-only. It reports usage; it never modifies, bypasses, or extends
> any provider's limits.**
>
> Plimsoll has no server. It collects no data, sends no analytics, and contains no
> third-party code. Your settings and usage history stay in your browser, and you can
> export or delete all of it from the options page at any time.
>
> Works on claude.ai, chatgpt.com and gemini.google.com. Open source (MIT).
>
> Plimsoll is an independent project and is not affiliated with, endorsed by, or
> sponsored by Anthropic, OpenAI, or Google.

## Permission justifications

One clear user-facing sentence each — this is what the reviewer reads.

| Permission                    | Justification                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                     | Saves your settings and a local history of usage readings on your own device, so the panel keeps your preferences and can show a trend over time. |
| `https://claude.ai/*`         | Reads usage figures from Claude's own pages and displays the usage panel there.                                                                   |
| `https://chatgpt.com/*`       | Estimates conversation context usage and displays the usage panel there.                                                                          |
| `https://gemini.google.com/*` | Estimates conversation context usage and displays the usage panel there.                                                                          |

**Not requested, deliberately:** `tabs` (the tab id and `tabs.sendMessage` both work
without it), `<all_urls>`, `scripting`, `webRequest`, `cookies`, `management`.
`scripts/check-target.ts` fails the build if any of these appear in the manifest.

**Remote code:** none. No `eval`, no `new Function`, no CDN imports. Everything
executed ships in the package. Source maps are included and the source is public.

## Data disclosure answers

The store asks about each category. The answer is the same for all of them.

| Category                            | Collected? |
| ----------------------------------- | ---------- |
| Personally identifiable information | No         |
| Health information                  | No         |
| Financial and payment information   | No         |
| Authentication information          | No         |
| Personal communications             | No         |
| Location                            | No         |
| Web history                         | No         |
| User activity                       | No         |
| Website content                     | No         |

Certifications:

- ✅ I do not sell or transfer user data to third parties, outside of the approved use cases
- ✅ I do not use or transfer user data for purposes unrelated to my item's single purpose
- ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes

Privacy policy URL: `https://plimsoll.anubris.com/privacy`

> Note on the `monitor` build: it displays figures already shown to the signed-in user
> by the provider. Nothing is transmitted anywhere, and nothing is stored beyond the
> user's own browser.

## AI policy compliance

The policy effective 1 August 2026 prohibits extensions "designed to circumvent safety
guardrails, usage restrictions, or other protective measures implemented by AI-powered
services". Plimsoll is on the correct side of this by construction:

- It contains no auto-resume, no retry-after-cap, no limit bypass, no account rotation.
- It makes no request that a signed-in user's own browser would not already make.
- No listing or in-product copy suggests continuing past a limit.
- In the `full` build, conversation export is framed strictly as data portability, is
  always user-initiated, and is never surfaced in response to a limit warning.

## Screenshots

Generated by `scripts/screenshots.ts` from **sanitized fixture pages**, never from a
live account — a live capture would put real spend, balance and conversation titles
into a public listing.

1. Panel on a conversation page showing context usage with its `est.` provenance chip
2. Panel showing Claude session and weekly meters with reset times
3. A signal reading "not available on this site", demonstrating honest degradation
4. Options → Settings
5. Options → Health, showing per-strategy detection status
6. Options → Data, showing export and delete-everything

## Pre-submission checklist

- [ ] `pnpm run verify` green
- [ ] `pnpm run build:monitor && pnpm run check:target monitor` green
- [ ] Manifest contains no `tabs`, no `<all_urls>`
- [ ] `homepage_url` and privacy policy URL both resolve
- [ ] Screenshots regenerated from fixtures, checked for any real value
- [ ] Version bumped and CHANGELOG updated
