import { useEffect } from 'react';
import { startColorMode } from '../lib/color-mode';
import '../color-mode.css';
export default function ColorModeToggle() {
  useEffect(() => startColorMode(document.documentElement), []);
  return (<button type="button" className="cc-theme-toggle" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode" hidden>
  <svg data-theme-moon viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5a8.5 8.5 0 1 0 9.7 9.7Z"/></svg>
  <svg data-theme-sun viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>
</button>);
}
