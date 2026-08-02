# Phase 0A — Online research

All findings below were retrieved live on the dates shown. Nothing here was taken from
model training data; npm versions in particular were queried against the registry
because three previous attempts failed on unverified assumptions.

**Status of everything in this file: lead, not truth.** A third-party repo or a blog
post is a starting point for a capture, never a source for a selector or an endpoint.
Nothing here ships until Phase 0B confirms it against a live capture.

Legend: **[primary]** = the provider's own documentation. **[secondary]** = third-party
reporting, treated as unverified.

---

## 1. Chrome Web Store policy — verified 2026-08-02

Source: <https://developer.chrome.com/blog/cws-policy-updates-2026> **[primary]**

Confirmed verbatim, effective **1 August 2026** (i.e. already in force):

- Prohibits extensions "designed to circumvent safety guardrails, usage restrictions,
  or other protective measures implemented by AI-powered services."
- Data collection must be "strictly necessary to the extension's disclosed single
  purpose", with all collection prominently disclosed.
- Developers must proactively notify users of post-install changes to data handling.

**Consequence for Plimsoll:** the read-only guarantee is not marketing copy, it is the
compliance position. No auto-resume, no limit bypass, no retry-after-cap, no account
rotation, and no copy implying any of those. Plimsoll complies with the data rules by
collecting nothing at all.

---

## 2. Anthropic — how usage and limits actually work

### 2.1 Usage limits — no fixed message count

Source: <https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work>
— retrieved 2026-08-03 **[primary]**

> "Your usage is affected by several factors, including the length and complexity of
> your conversations, the features you use, which Claude model you're chatting with,
> and the effort level you've selected."

Anthropic publishes **no fixed message count**. This is the authoritative basis for
PROMPT §7: Plimsoll must never invent a limit number. Where no real number exists, the
bar reads `n/a`.

### 2.2 Context window — official figures

Same source, **[primary]**:

> "The context window size depends on which model you're using. On paid plans, the
> newest models support up to a 1M token context window, while others support 500K or
> 200K tokens."

So 200K / 500K / 1M are the documented tiers. Note the doc ties the size to **model**;
it does not publish a per-surface (web chat vs Claude Code) breakdown. A **[secondary]**
claim that web chat caps at 500K even on 1M-capable models appears at
<https://tygartmedia.com/claude-at-scale-usage-limits-context-window-file-size-2026/>
(retrieved 2026-08-03) but is **not corroborated by Anthropic** and must not be encoded
as fact. Ceilings ship as user-editable defaults labelled `(est.)`.

Also relevant: with code execution enabled, Claude auto-summarises earlier messages near
the context limit. That means a DOM-derived context estimate can _fall_ mid-conversation
without the user deleting anything — the estimate is a lower bound and the tooltip must
say so.

### 2.3 Reset windows and credits

Source: <https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans>
— retrieved 2026-08-03 **[primary]**

- "Your plan's included usage limit will reset every five hours once you reach it."
  Confirms the rolling ~5-hour session window.
- Usage credits let Pro/Max users continue at standard API rates after the included
  allowance is exhausted.
- Documented settings fields: **current balance**, **monthly spending cap**,
  **auto-reload** threshold/amount, usage history, **current month-to-date spending**.

This corroborates the expected usage-page text in PROMPT §4.2 almost field for field —
the `… spent`, `Monthly spend limit` and `Current balance · Auto-reload Off` labels all
have a documented counterpart. Strong evidence that §4.2's structure is real. It still
requires a live capture before a parser is written — corroboration is not observation.

> **Note on the §4.2 sample.** The amounts in that block appear to be a real reading,
> not invented figures. They are deliberately **not** reproduced anywhere in this repo:
> labels and layout are what the parser needs, and the amounts are private financial
> data. Test expectations run against sanitized fixtures with synthetic values. The
> privacy test caught an earlier draft of this very file quoting one of them.

Max plans carry **two** weekly limits (all-models and Sonnet-only) per
<https://support.claude.com/en/articles/11049741-what-is-the-max-plan> **[secondary
summary, retrieved 2026-08-03]**. If true, the "weekly" bar may need to be plural.
**Open question for capture:** does `/settings/usage` render one weekly meter or two?

### 2.4 What Anthropic does not publish

No per-plan message counts, no formula converting conversation length to usage, and no
public usage API for consumer plans. Any usage endpoint Plimsoll finds is therefore
**undocumented and unsupported**, which is exactly why the etiquette rules in PROMPT
§5.3 exist.

---

## 3. OpenAI and Google — gaps recorded honestly

Neither provider publishes a consumer-plan usage/quota API or a documented in-product
usage meter equivalent to Claude's `/settings/usage`. As of 2026-08-03 no primary source
was found for:

- a ChatGPT session/weekly limit readout, or
- a Gemini usage/quota readout.

Per PROMPT §1, these stay ❓ until Phase 0B capture either finds a source or does not.
If not found, they ship as `unavailable` — the UI says "not available on this site",
never `0%`.

---

## 4. Prior art — consulted for facts only

> **Licence hygiene.** An endpoint path or response shape is a fact and free to use.
> Implementation is not. No code from any project below has been or may be copied into
> this MIT repo.

| Project                                                                                                                         | Licence         | Usable?                                   | What it suggests                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [lugia19/Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension)                                             | **GPL-3.0**     | Facts only — **code strictly off-limits** | Requires the user's **organization ID**; estimates tokens client-side; optionally uses an API key |
| [oov/claude-usage-monitor](https://github.com/oov/claude-usage-monitor)                                                         | MIT             | Facts only (we still write our own)       | Also requires an **organization ID**                                                              |
| [she-llac/claude-counter](https://github.com/she-llac/claude-counter)                                                           | not yet checked | —                                         | Token count + usage bars against a 200K context limit                                             |
| [chriswa/claude-usage-limit-tracker-browser-extension](https://github.com/chriswa/claude-usage-limit-tracker-browser-extension) | not yet checked | —                                         | Writes usage to a local JSON file                                                                 |
| [Bitcoineo/claudeUsageExtension](https://github.com/Bitcoineo/claudeUsageExtension)                                             | not yet checked | —                                         | Colour-coded bars + toolbar badge                                                                 |

All retrieved 2026-08-02.

### 4.1 The strongest lead

**Two independent projects require the user to supply an Organization ID.** A client
needs an org UUID for exactly one reason: to build a URL. This points at a usage
endpoint shaped like:

```
/api/organizations/{org_uuid}/…
```

**This path is not written anywhere in Plimsoll and will not be, unless it appears in a
capture from the user's own session.** Attempt #3 failed by guessing an endpoint pattern
that never matched a single request. Verification checklist in
[docs/capture-protocol.md](../docs/capture-protocol.md) step 2.

---

## 5. Toolchain — versions queried from the npm registry 2026-08-02/03

| Package             | Registry latest | Pinned    | Why                                                      |
| ------------------- | --------------- | --------- | -------------------------------------------------------- |
| wxt                 | 0.21.3          | 0.21.3    | Still 0.x — pin exactly, breaking changes between minors |
| typescript          | **7.0.2**       | **6.0.3** | See §5.1                                                 |
| react               | 19.2.8          | —         | Phase 3                                                  |
| zod                 | 4.4.3           | —         | Phase 1                                                  |
| vitest              | 4.1.10          | 4.1.10    |                                                          |
| eslint              | 10.8.0          | 10.8.0    |                                                          |
| @eslint/js          | 10.0.1          | 10.0.1    | Versioned separately from eslint — 10.8.0 does not exist |
| typescript-eslint   | 8.65.0          | 8.65.0    |                                                          |
| @playwright/test    | 1.62.1          | —         | Phase 5                                                  |
| @changesets/cli     | 2.31.1          | —         | Later                                                    |
| prettier            | 3.9.6           | 3.9.6     |                                                          |
| @types/node         | 26.1.2          | 26.1.2    |                                                          |
| husky / lint-staged | 9.1.7 / 17.3.0  | same      |                                                          |

### 5.1 Amendment: TypeScript pinned to 6.0.3, not 7.0.2

PROMPT §3 says use current majors. Reality disagrees, so per §12 reality wins and this
is the amendment.

`typescript@7.0.2` is the current stable `latest`. But `typescript-eslint@8.65.0`
declares `peerDependencies.typescript: ">=4.8.4 <6.1.0"`, and there is no
typescript-eslint release supporting TS 7 (dist-tags are `latest: 8.65.0`,
`canary: 8.65.1-alpha.20` — no v9 line). Adopting TS 7 today means giving up type-aware
linting, which is where `no-floating-promises` and the other correctness rules live.

**Decision:** pin `typescript@6.0.3`, the newest stable release inside the supported
range. WXT accepts `typescript >=5.4`, so this constrains nothing downstream.
**Revisit when typescript-eslint ships TS 7 support.**

Verified after install: `pnpm run typecheck`, `pnpm run lint` and `pnpm run test` all
pass on this combination.

### 5.2 Amendment: secretlint instead of the npm "gitleaks" package

PROMPT §2.4 asks for gitleaks or trufflehog. The package published as `gitleaks` on npm
is **version 1.0.0, by an unrelated third party** (`ycjcl868`,
<https://github.com/ycjcl868/gitleaks>), not the official `zricethezav/gitleaks` Go tool,
which is at v8.x and is not distributed via npm. Installing it into a privacy harness
would be a supply-chain error.

**Decision:**

- Local + pre-commit: **secretlint 13.0.4** (pure npm, cross-platform, no binary download).
- CI: the **official gitleaks GitHub Action**, which runs the real binary on Linux.

Both are wired into `pnpm run check:privacy`. Neither may be skipped silently — a
missing scanner fails the check rather than passing it.

### 5.3 WXT

Source: <https://wxt.dev/guide/installation.html> — retrieved 2026-08-03 **[primary]**

Bootstrap is `pnpm dlx wxt@latest init`; entrypoints live in `entrypoints/`; the
manifest is generated from `wxt.config.ts`; content scripts have first-class Shadow DOM
support via `createShadowRootUi`. Detailed API surface to be read from
`/guide/essentials/content-scripts` at the start of Phase 3 rather than from memory.

---

## 6. Open questions for Phase 0B capture

1. Does a usage endpoint exist under `/api/organizations/{uuid}/…`, and what is its
   exact path, method, status and body?
2. Does `/settings/usage` render **one** weekly meter or **two** (all-models +
   Sonnet-only) on a Max plan?
3. Does the §4.2 text structure reproduce exactly on the live page today?
4. Is there any ChatGPT or Gemini response carrying quota/limit fields at all?
5. What does each endpoint return when signed out (expect 401/403)?

Sources for every claim above are linked inline with retrieval dates.
