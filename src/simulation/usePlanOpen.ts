import { useState } from 'react';
import { readChoice, remember } from '../remembered';

const STORAGE_KEY = 'curve.planOpen';
// The same width as in styles.css, where the plan stops taking space and lies over the page instead.
const WIDE_SCREEN = '(min-width: 60.01rem)';

function readPlanOpen(): boolean {
  const stored = readChoice(STORAGE_KEY);
  return stored === null ? window.matchMedia(WIDE_SCREEN).matches : stored === 'true';
}

// One choice for all the tabs. It is only stored once it has been made, so until then it follows the screen.
export function usePlanOpen() {
  const [open, setOpen] = useState(readPlanOpen);

  function choose(next: boolean) {
    setOpen(next);
    remember(STORAGE_KEY, String(next));
  }

  return [open, choose] as const;
}
