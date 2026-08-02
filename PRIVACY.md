# Privacy Policy — Plimsoll

_Last updated: 2026-08-03. Applies to the Plimsoll browser extension and
plimsoll.anubris.com._

## The short version

Plimsoll collects nothing, transmits nothing, and has no server.

## What Plimsoll collects

**No data is collected.** Plimsoll does not gather personal information, browsing
history, message content, credentials, or usage analytics.

## What Plimsoll stores, and where

Plimsoll stores your settings and a local history of usage readings so it can show
trends over time. This is written to `chrome.storage.local` — your own browser, on your
own device. It is never uploaded.

You can export everything Plimsoll has stored, or delete all of it, from the extension's
**Options → Data** tab.

## Network requests

Plimsoll makes network requests to exactly one category of destination: the AI provider
whose page you are currently viewing and already signed into (claude.ai, chatgpt.com,
gemini.google.com). Those requests read usage information using your existing session,
in the same way the page itself does.

Plimsoll contains no analytics, no telemetry, no crash reporting, no advertising
identifiers, and no third-party SDKs. It makes no request to any Plimsoll-operated
server, because none exists.

## Third parties

None. No data is sold, shared, or transferred to anyone, for any purpose.

## Permissions and why each is needed

| Permission                                                     | Why                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `storage`                                                      | Save your settings and local usage history on your device.                |
| Host access to `claude.ai`, `chatgpt.com`, `gemini.google.com` | Read usage information from the page you are on and show the panel there. |

Plimsoll does **not** request the `tabs` permission and does not use `<all_urls>`.

## Children

Plimsoll is not directed at children and collects no data from anyone.

## Changes

Material changes to this policy will be recorded in
[CHANGELOG.md](CHANGELOG.md) and published here before taking effect.

## Contact

Report a privacy concern via [GitHub Issues](https://github.com/sariamubeen/plimsoll/issues),
or privately per [SECURITY.md](SECURITY.md).
