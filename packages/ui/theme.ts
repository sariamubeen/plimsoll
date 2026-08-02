/**
 * Panel styles, injected inside the Shadow DOM.
 *
 * Design direction: a ship's instrument panel. Deep hull, brass markings, sea green.
 * Every gauge is a waterline against a scale rather than a generic progress bar,
 * because the product is named after the load line and that is the one place worth
 * spending a distinctive idea.
 *
 * Constraints this has to live inside, which shape the type choices:
 *   - No web fonts. MV3 forbids remote code, and pulling a font into someone else's
 *     page is rude. So the personality comes from how the system stack is SET —
 *     wide-tracked uppercase micro-labels like instrument markings, tabular numerals
 *     for anything that changes — not from the family.
 *   - This is a persistent HUD on a page the user actually came to use. It stays small
 *     and quiet. Nothing animates except a 160ms waterline.
 *
 * Scoped both directions: host CSS cannot reach in, and nothing here leaks out.
 * AA contrast in both schemes, reduced motion respected, colour never the only signal.
 */
export const PANEL_CSS = `
:host {
  all: initial;

  --pl-hull: #ffffff;
  --pl-sunk: #f2f5f7;
  --pl-rule: #dde3e7;
  --pl-chalk: #14202a;
  --pl-fog: #5c6b76;
  --pl-brass: #a06a16;
  --pl-safe: #2f7d5e;
  --pl-warn: #8a5a00;
  --pl-danger: #b3352c;
  --pl-focus: #0b5cd5;
  --pl-shadow: 0 6px 20px rgba(16, 32, 44, 0.16);

  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 12px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

@media (prefers-color-scheme: dark) {
  :host {
    --pl-hull: #0f1519;
    --pl-sunk: #182127;
    --pl-rule: #27343c;
    --pl-chalk: #e6edf1;
    --pl-fog: #8b9aa4;
    --pl-brass: #d09a3f;
    --pl-safe: #4f9d7e;
    --pl-warn: #d99a3a;
    --pl-danger: #e0736a;
    --pl-focus: #6ea8ff;
    --pl-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
  }
}

*, *::before, *::after { box-sizing: border-box; }

/* ---------------------------------------------------------------- shell -- */

.panel {
  position: fixed;
  z-index: 2147483000;
  width: 232px;
  background: var(--pl-hull);
  color: var(--pl-chalk);
  border: 1px solid var(--pl-rule);
  border-radius: 10px;
  box-shadow: var(--pl-shadow);
  overflow: hidden;
}

.panel--top-left { top: 14px; left: 14px; }
.panel--top-right { top: 14px; right: 14px; }
.panel--bottom-left { bottom: 14px; left: 14px; }
.panel--bottom-right { bottom: 14px; right: 14px; }
.panel--left { top: 50%; left: 14px; transform: translateY(-50%); }
.panel--right { top: 50%; right: 14px; transform: translateY(-50%); }

/* Docked to the composer: the content script supplies the coordinates. */
.panel--composer { position: fixed; }

.panel--collapsed { width: auto; border-radius: 999px; }

/* --------------------------------------------------------------- header -- */

.header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 9px;
  border-bottom: 1px solid var(--pl-rule);
}
.panel--collapsed .header { border-bottom: none; padding: 6px 8px; }

.wordmark {
  flex: 1;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.mark__ring, .mark__line {
  fill: none;
  stroke: var(--pl-brass);
  stroke-width: 9;
}
.mark__line { stroke-linecap: butt; }
.mark__flood { fill: var(--pl-brass); opacity: 0.35; }

/* --------------------------------------------------------------- buttons -- */

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  font: inherit;
  font-size: 11px;
  color: var(--pl-fog);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
button:hover:not(:disabled) { background: var(--pl-sunk); color: var(--pl-chalk); }
button:disabled { opacity: 0.5; cursor: default; }
:focus-visible { outline: 2px solid var(--pl-focus); outline-offset: 1px; }

/* ----------------------------------------------------------------- rows -- */

.rows { list-style: none; margin: 0; padding: 9px; display: grid; gap: 11px; }

/* Grid items default to min-width:auto, so a long detail line refuses to shrink,
   widens the row past the panel, and shoves the right-aligned value out of sight
   behind overflow:hidden. This is what makes the value visible at all. */
.rows > li { min-width: 0; }

.row__head { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.row__title { flex-shrink: 0; }

/* Instrument marking: small, wide-tracked, uppercase. */
.row__title {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pl-fog);
}

.row__value {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.chip {
  font-size: 9px;
  letter-spacing: 0.04em;
  padding: 0 4px;
  border-radius: 3px;
  color: var(--pl-fog);
  background: var(--pl-sunk);
}

/* ---------------------------------------------------------------- gauge -- */

.gauge {
  position: relative;
  height: 7px;
  margin-top: 5px;
  background: var(--pl-sunk);
  border-radius: 2px;
  overflow: hidden;
}

/* Quarter graduations, like the marks beside a load line. Drawn ABOVE the fill —
   z-index matters here, or the fill paints straight over the scale. */
.gauge::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  background-image: linear-gradient(to right, var(--pl-hull) 0 1px, transparent 1px);
  background-size: 25% 100%;
  background-position: 25% 0;
  background-repeat: repeat-x;
  opacity: 0.55;
  pointer-events: none;
}

.gauge__fill {
  position: relative;
  height: 100%;
  border-radius: 2px 0 0 2px;
  transition: width 160ms ease-out;
}
.gauge__fill--ok { background: var(--pl-safe); }
.gauge__fill--warn { background: var(--pl-warn); }
.gauge__fill--critical { background: var(--pl-danger); }

/* The waterline: a brighter cap at the leading edge, where the hull meets the water. */
.gauge__fill::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 2px;
  background: var(--pl-chalk);
  opacity: 0.6;
}

/* Unknown is hatched, never an empty track. An empty track reads as "0% used", which
   is the single most damaging thing this panel could imply. */
.gauge--unknown {
  background-image: repeating-linear-gradient(
    -45deg, var(--pl-rule), var(--pl-rule) 2px, transparent 2px, transparent 5px
  );
  background-color: transparent;
  border: 1px dashed var(--pl-rule);
}
.gauge--unknown::after { display: none; }

.row__note {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--pl-fog);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row--stale { opacity: 0.6; }

/* ------------------------------------------------------- unavailable set -- */

/* One quiet line instead of a stack of empty gauges. Signals with no source on this
   site are worth stating once, not worth three rows of chrome. */
.unavailable {
  margin: 0;
  padding: 8px 9px;
  border-top: 1px solid var(--pl-rule);
  font-size: 10.5px;
  color: var(--pl-fog);
}
.unavailable__names { color: var(--pl-chalk); opacity: 0.75; }

/* --------------------------------------------------------------- footer -- */

.footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border-top: 1px solid var(--pl-rule);
  font-size: 10.5px;
  color: var(--pl-fog);
}
.footer__stale { color: var(--pl-warn); }

/* -------------------------------------------------------------- placing -- */

.placer { position: relative; }

.placer__menu {
  position: absolute;
  top: 26px;
  right: 0;
  z-index: 1;
  padding: 6px;
  background: var(--pl-hull);
  border: 1px solid var(--pl-rule);
  border-radius: 8px;
  box-shadow: var(--pl-shadow);
  display: grid;
  grid-template-columns: repeat(3, 24px);
  gap: 3px;
}
.placer__menu button[aria-pressed="true"] {
  color: var(--pl-brass);
  border-color: var(--pl-brass);
}
.placer__wide { grid-column: 1 / -1; font-size: 10px; letter-spacing: 0.04em; }

.visually-hidden {
  position: absolute; width: 1px; height: 1px;
  margin: -1px; padding: 0; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;
