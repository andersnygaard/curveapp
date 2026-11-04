import { useState } from 'react';

const STORAGE_KEY = 'curve.planOpen';
// The same width as in styles.css, where the plan stops taking space and lies over the page instead.
const WIDE_SCREEN = '(min-width: 60.01rem)';

function readPlanOpen(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // Storage can be blocked. The choice then lasts until the page is reloaded.
  }
  return window.matchMedia(WIDE_SCREEN).matches;
}

// One choice for all the tabs. It is only stored once it has been made, so until then it follows the screen.
export function usePlanOpen() {
  const [open, setOpen] = useState(readPlanOpen);

  function choose(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Storage can be blocked. The choice then lasts until the page is reloaded.
    }
  }

  return [open, choose] as const;
}
