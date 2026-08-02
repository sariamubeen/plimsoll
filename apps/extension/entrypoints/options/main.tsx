import { createRoot } from 'react-dom/client';
import { PANEL_CSS } from '@plimsoll/ui/theme';
import { App } from './App.tsx';

const style = document.createElement('style');
style.textContent = `${PANEL_CSS}
body {
  margin: 0; padding: 24px; background: var(--pl-bg); color: var(--pl-fg);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 14px; line-height: 1.5;
}
main { max-width: 720px; margin: 0 auto; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 15px; margin: 24px 0 8px; }
fieldset { border: 1px solid var(--pl-border); border-radius: 8px; padding: 12px 14px; margin: 0 0 16px; }
legend { font-weight: 600; padding: 0 6px; }
label { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
label > span.grow { flex: 1; }
input[type="number"], select { font: inherit; padding: 3px 6px; border: 1px solid var(--pl-border); border-radius: 6px; background: var(--pl-bg); color: var(--pl-fg); }
.tabs { display: flex; gap: 8px; margin: 16px 0; }
.tabs button[aria-selected="true"] { background: var(--pl-track); font-weight: 600; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--pl-border); }
code { font-size: 12px; }
.note { color: var(--pl-muted); font-size: 13px; }`;
document.head.appendChild(style);

const container = document.getElementById('root');
if (container !== null) createRoot(container).render(<App />);
