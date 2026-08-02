import { createRoot } from 'react-dom/client';
import { PANEL_CSS } from '@plimsoll/ui/theme';
import { App } from './App.tsx';

const style = document.createElement('style');
style.textContent = `${PANEL_CSS}
body { margin: 0; width: 300px; background: var(--pl-bg); color: var(--pl-fg); }
.panel { position: static; width: auto; border: none; box-shadow: none; }`;
document.head.appendChild(style);

const container = document.getElementById('root');
if (container !== null) createRoot(container).render(<App />);
