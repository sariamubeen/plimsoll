# Capture protocol (Phase 0B)

Everything Plimsoll parses must come from a real capture. No selector, text shape, or
endpoint may be written from assumption — three previous attempts failed exactly that
way, and each looked correct in review.

This document is the procedure for producing those captures without leaking your
account data into a public repo.

---

## The two rules

1. **Raw captures go to `fixtures/raw/` and never leave it.** That directory is
   gitignored. It holds your real spend, balance, org UUIDs, session tokens and
   conversation titles.
2. **Nothing raw gets pasted into a chat or an issue.** Paste only the _key-shape_
   dump from step 4, which contains key names and value _types_ — never values.

If a raw capture is ever committed, editing it away in a later commit is not enough.
The data stays in history. Recovery means `git-filter-repo`, a force-push, and
treating any exposed session token as compromised (sign out of all sessions on that
provider to invalidate it).

---

## Before you capture anything

```bash
pnpm install
pnpm run check:privacy   # must pass before the first capture lands
```

---

## Setup: paste this helper first

Open DevTools (F12) → Console on the signed-in page, and paste this once per tab. It
downloads captures straight to your Downloads folder, which avoids the clipboard and
avoids console truncation on large bodies.

```js
window.__pl = {
  dl: (name, text) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    console.log('[plimsoll] downloaded', name);
  },
};
```

> If the console refuses to let you paste, type `allow pasting` and press Enter first.

---

## Step 1 — Structural capture (all three sites)

Run on a **chat page with a few messages**. This records element structure only —
tag names, test ids, roles, ARIA labels, class-name prefixes and ancestor paths. It
deliberately does **not** capture message text: selectors don't need it, and
capturing it would create a sanitisation burden for no benefit.

```js
(() => {
  const out = { url: location.href, ts: new Date().toISOString() };
  const desc = (el) =>
    el && {
      tag: el.tagName,
      id: el.id || null,
      testid: el.getAttribute?.('data-testid') || null,
      role: el.getAttribute?.('role') || null,
      aria: el.getAttribute?.('aria-label') || null,
      cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 120),
      path: (() => {
        const p = [];
        let n = el;
        while (n && n.nodeType === 1 && p.length < 6) {
          p.unshift(
            n.tagName.toLowerCase() +
              (n.getAttribute('data-testid')
                ? `[data-testid="${n.getAttribute('data-testid')}"]`
                : ''),
          );
          n = n.parentElement;
        }
        return p.join(' > ');
      })(),
    };
  const composer = [...document.querySelectorAll('div[contenteditable="true"], textarea')]
    .filter((e) => e.offsetParent !== null)
    .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
  out.composer = desc(composer);
  out.composerAncestors = (() => {
    const a = [];
    let n = composer?.parentElement;
    for (let i = 0; i < 5 && n; i++, n = n.parentElement) a.push(desc(n));
    return a;
  })();
  out.testids = [
    ...new Set(
      [...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')),
    ),
  ].slice(0, 80);
  out.mainTextLength = document.querySelector('main')?.innerText?.length || 0;
  out.bodyTextLength = document.body.innerText.length;
  window.__pl.dl('structure.json', JSON.stringify(out, null, 2));
})();
```

**Save to:** `fixtures/raw/<site>/structure.json` where `<site>` is `claude`,
`chatgpt` or `gemini`.

---

## Step 2 — Network instrumentation (all three sites)

Paste this **before** sending a message, then send one short message.

```js
(() => {
  const of = window.fetch;
  window.fetch = async function (...a) {
    const url = typeof a[0] === 'string' ? a[0] : a[0]?.url || '';
    const r = await of.apply(this, a);
    if (url.startsWith(location.origin)) {
      console.log('[plimsoll]', r.status, (r.headers.get('content-type') || '').split(';')[0], url);
    }
    return r;
  };
  console.log('[plimsoll] instrumented — now send a message');
})();
```

Then in **DevTools → Network → Fetch/XHR**, look for any response carrying
usage, quota, limit, rate, or credit fields.

**What we're hunting for on claude.ai:** two independent third-party extensions
require the user to supply an _Organization ID_, which suggests a usage endpoint
shaped like `/api/organizations/{uuid}/…`. That is a **lead, not a fact** — it only
gets written into Plimsoll if it shows up in your capture. If it doesn't appear,
that tier simply does not exist for Claude and the usage-page parse becomes primary.

For each interesting response: right-click → **Copy → Copy response**, and save to
`fixtures/raw/<site>/<name>-response.json`. Note the method, status and
content-type — step 5 needs them.

---

## Step 3 — Claude usage page (claude.ai only)

Go to <https://claude.ai/settings/usage>, wait for the meters to render, then:

```js
window.__pl.dl('usage-page.txt', document.body.innerText);
```

**Save to:** `fixtures/raw/claude/usage-page.txt`

> ⚠️ This capture includes the **sidebar, with your real conversation titles**. The
> sanitiser scrubs pattern-based PII (amounts, UUIDs, emails) automatically, but no
> regex can tell a conversation title from a UI label. `pnpm run sanitize` prints
> every line it did not recognise as meter text — **read that list** and confirm the
> sanitized file is clean before committing it.

If the page shows _"Unable to load usage limits."_, capture that too, as
`usage-page-error.txt`. Plimsoll must detect that state and refuse to cache a
reading rather than storing a wrong one.

---

## Step 4 — Key-shape dump (the only thing safe to paste)

For any JSON response found in step 2, run this against the parsed body. It emits key
names and value **types** — string lengths, not string contents. No values leak, so
this output is safe to paste into chat or an issue.

```js
(() => {
  const shape = (v) =>
    Array.isArray(v)
      ? [v.length ? shape(v[0]) : 'empty', `len=${v.length}`]
      : v === null
        ? 'null'
        : typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]))
          : typeof v === 'string'
            ? `string(${v.length})`
            : typeof v;
  // Replace with the response you captured:
  fetch(location.origin + '/PUT_THE_PATH_HERE', { credentials: 'include' })
    .then((r) => r.json())
    .then((j) => console.log(JSON.stringify(shape(j), null, 2)));
})();
```

This is what lets the zod schema be written precisely without the real body ever
being seen by anyone but you.

---

## Step 5 — Signed-out behaviour

Sign out (or use a private window) and re-request any endpoint found in step 2.
Record the status code — expect 401 or 403. Save the response to
`fixtures/raw/<site>/<name>-signed-out.json`.

This is the one row of the error matrix that cannot be inferred, and Plimsoll needs
it to distinguish "you are signed out" from "the endpoint moved".

---

## Step 6 — Sanitize, review, commit

```bash
pnpm run sanitize          # fixtures/raw/ -> fixtures/sanitized/
pnpm run check:privacy     # must be green
git status                 # confirm NOTHING under fixtures/raw/ is staged
```

Read the sanitiser's "not recognised as meter text" list before committing. Then
open `fixtures/sanitized/<site>/` and read the files with your own eyes. The
automated checks catch patterns; you are the only one who can catch a conversation
title that happens to look like a UI string.

---

## What each capture unblocks

| Capture                | Unblocks                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `structure.json`       | Composer/message selector chains, context estimation        |
| `*-response.json`      | Tier-1 authenticated fetch, zod schema, `docs/endpoints.md` |
| `usage-page.txt`       | Claude session/weekly/credit parsing (PROMPT §4.2 traps)    |
| `usage-page-error.txt` | "Refuse to cache on error state" behaviour                  |
| `*-signed-out.json`    | 401/403 handling in the error matrix                        |

Any capture that cannot be obtained means that signal ships as **`unavailable`** and
the UI reads "not available on this site" — never `0%`, never an empty bar.
