<!-- Thanks for contributing. The checklist is short but it is the actual bar. -->

## What this changes

## Why

---

## Checklist

- [ ] `pnpm run verify` passes
- [ ] No selector, parser, regex, or endpoint was added without real captured data in
      `fixtures/` backing it (see CONTRIBUTING §1)
- [ ] `git status` confirms nothing under `fixtures/raw/` is staged
- [ ] No unknown value can render as `0` — absences go through `unavailableReading()`
- [ ] No new permission requested
- [ ] Nothing here helps a user continue past a limit

### If this adds or changes a parser

- [ ] Sanitized fixture committed, with synthetic values
- [ ] Golden snapshot updated and the diff reviewed
- [ ] Resilience test proving broken input degrades to `unavailable` rather than
      throwing or reporting `0%`

### If this touches the build targets

- [ ] `pnpm run build:full && pnpm run check:target full`
- [ ] `pnpm run build:monitor && pnpm run check:target monitor`
