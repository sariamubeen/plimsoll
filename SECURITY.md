# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**, not in a public issue.

Use GitHub private reporting:
[Report a vulnerability](https://github.com/sariamubeen/plimsoll/security/advisories/new)

Include what you were doing, what happened, and how to reproduce it. You will get an
acknowledgement within 7 days and an assessment within 14.

Please do not test against other people's accounts, and do not include anyone else's
personal data in a report.

## Scope

In scope:

- Anything that causes Plimsoll to transmit data off the user's device
- Anything that lets a visited page read Plimsoll's stored data or escalate through the
  extension
- Anything that causes requests beyond the declared host permissions
- Personal data reaching a committed file, or git history

Out of scope:

- Reports that a usage figure is inaccurate. Context is an explicitly labelled estimate
  and a lower bound.
- Missing signals on ChatGPT or Gemini. Those are declared unavailable deliberately,
  because no verified source exists for them.

## Personal data in this repository

The discovery process captures real account data by design, and this repository is
public. Raw captures live only in the gitignored `fixtures/raw/`.

If you find personal data — spend figures, org UUIDs, session tokens, conversation
titles, email addresses — in any committed file or anywhere in git history, please
report it privately using the link above rather than opening an issue.

Remediation is a history rewrite with `git-filter-repo` and a force-push. Any exposed
session token is treated as compromised and invalidated by signing out of all sessions
on that provider.

## What Plimsoll does not do

Plimsoll has no server, collects no data, ships no remote code, and bundles no
third-party SDKs. It requests `storage` plus three host permissions and nothing else.

These are enforced by lint rules and by `scripts/check-target.ts` in CI, not merely by
policy.
