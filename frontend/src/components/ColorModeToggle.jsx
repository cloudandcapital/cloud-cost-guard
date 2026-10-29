import { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { startColorMode } from '../lib/color-mode';
import '../color-mode.css';
export default function ColorModeToggle() {
  useEffect(() => startColorMode(document.documentElement), []);
  return (<button type="button" className="cc-theme-toggle" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode" hidden>
  <Moon data-theme-moon strokeWidth={1.5} aria-hidden="true"/>
  <Sun data-theme-sun strokeWidth={1.5} aria-hidden="true"/>
</button>);
}
