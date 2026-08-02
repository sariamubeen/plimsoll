# fixtures/sanitized/

Committed, public, safe. Every file here is generated from `fixtures/raw/` by
`pnpm run sanitize` and carries **synthetic values in a real structure**.

Nothing is hand-edited here. If a fixture is wrong, fix the raw capture or the
sanitizer and regenerate — otherwise the sanitized copy stops matching what the
provider actually returns, which is how parsers drift back into guesswork.

Layout mirrors `raw/` exactly:

```
sanitized/
├─ claude/
├─ chatgpt/
└─ gemini/
```

`fixtures/raw/` is gitignored and must never be committed. See
[docs/capture-protocol.md](../../docs/capture-protocol.md).
