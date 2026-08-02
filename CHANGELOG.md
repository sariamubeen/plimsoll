# Changelog

All notable changes are documented here. This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Pre-release. Not yet published to any store.

### Added

- Privacy harness: a PII pattern table shared by the fixture sanitizer and the CI test,
  secret scanning, and a test proving raw captures have never been tracked in history.
- Core: usage reading types where `null` is the only representation of unknown, token
  estimation with editable ceilings, burn-rate forecasting that returns a range or
  nothing at all, rolling history, and schema-versioned storage.
- Adapter contract with strategy chains replacing bare selectors, plus endpoint
  etiquette (60s floor, cross-tab single-flight, `Retry-After`, circuit breaker).
- Claude usage-page parser covering every documented trap in that page's text layout,
  with a golden snapshot.
- Adapters for claude.ai, chatgpt.com and gemini.google.com with an honest capability
  matrix — signals with no verified source are declared unavailable, not guessed.
- Shadow-DOM panel, popup, and options page with Settings, Health and Data tabs.
- `monitor` and `full` build targets, with CI proving `monitor` contains no portability
  code and no forbidden permissions.
- Conversation export in the `full` build, framed strictly as data portability.
- Project site with privacy and support pages.

### Known limitations

- **No API endpoint is implemented for any site.** None has been verified against a
  live capture, and none will be written from assumption. See `docs/endpoints.md`.
- **Session, weekly and credit signals are unavailable on ChatGPT and Gemini.** No
  provider source exists for them. They read "not available on this site".
- **Context usage is an estimate and a lower bound** on every site, because long
  conversations are virtualised and system instructions are never in the DOM.
