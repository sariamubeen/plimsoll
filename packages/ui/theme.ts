/**
 * Panel styles as a string, injected inside the Shadow DOM.
 *
 * Scoped both directions: host page CSS cannot reach in, and nothing here leaks out.
 * All colours meet WCAG AA against their background, every band is paired with a text
 * label elsewhere in the markup (colour is never the only signal), and every
 * transition is disabled under prefers-reduced-motion.
 */
export const PANEL_CSS = `
:host {
  all: initial;
  --pl-bg: #ffffff;
  --pl-fg: #1a1a1a;
  --pl-muted: #5c5c5c;
  --pl-border: #d4d4d4;
  --pl-track: #e8e8e8;
  --pl-ok: #1a7f37;
  --pl-warn: #8a5300;
  --pl-critical: #b3261e;
  --pl-unknown: #6b6b6b;
  --pl-focus: #0b5cd5;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

@media (prefers-color-scheme: dark) {
  :host {
    --pl-bg: #1c1c1e;
    --pl-fg: #f2f2f2;
    --pl-muted: #a8a8a8;
    --pl-border: #3a3a3c;
    --pl-track: #3a3a3c;
    --pl-ok: #4ac26b;
    --pl-warn: #d29922;
    --pl-critical: #ff7b72;
    --pl-unknown: #9a9a9a;
    --pl-focus: #6ea8ff;
  }
}

*, *::before, *::after { box-sizing: border-box; }

.panel {
  position: fixed;
  z-index: 2147483000;
  width: 268px;
  max-width: calc(100vw - 24px);
  padding: 10px 12px 12px;
  background: var(--pl-bg);
  color: var(--pl-fg);
  border: 1px solid var(--pl-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  font-size: 12px;
  line-height: 1.45;
}

.panel--top-left { top: 12px; left: 12px; }
.panel--top-right { top: 12px; right: 12px; }
.panel--bottom-left { bottom: 12px; left: 12px; }
.panel--bottom-right { bottom: 12px; right: 12px; }

.header { display: flex; align-items: center; gap: 8px; }
.title { font-weight: 600; font-size: 12px; margin: 0; flex: 1; }

button {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--pl-border);
  border-radius: 6px;
  padding: 2px 7px;
  cursor: pointer;
}
button:hover { background: var(--pl-track); }
:focus-visible { outline: 2px solid var(--pl-focus); outline-offset: 2px; }

.rows { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 9px; }

.row__head { display: flex; align-items: baseline; gap: 6px; }
.row__title { font-weight: 500; }
.row__value { margin-left: auto; font-variant-numeric: tabular-nums; }

.chip {
  font-size: 10px;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid var(--pl-border);
  color: var(--pl-muted);
  white-space: nowrap;
}

.track {
  height: 6px;
  margin-top: 4px;
  background: var(--pl-track);
  border-radius: 999px;
  overflow: hidden;
}

.fill { height: 100%; border-radius: 999px; transition: width 240ms ease; }
.fill--ok { background: var(--pl-ok); }
.fill--warn { background: var(--pl-warn); }
.fill--critical { background: var(--pl-critical); }

/* Unknown is drawn as hatching, never as an empty track. An empty track reads as
   "0% used", which is the single most damaging thing this UI could imply. */
.track--unknown {
  background-image: repeating-linear-gradient(
    45deg, var(--pl-track), var(--pl-track) 4px, transparent 4px, transparent 8px
  );
  border: 1px dashed var(--pl-border);
  background-color: transparent;
}

.row__note { color: var(--pl-muted); font-size: 11px; }
.row--stale { opacity: 0.62; }
.footer { margin-top: 10px; display: flex; align-items: center; gap: 8px; color: var(--pl-muted); font-size: 11px; }

.visually-hidden {
  position: absolute; width: 1px; height: 1px;
  margin: -1px; padding: 0; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;
