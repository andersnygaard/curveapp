// Dark or light. It follows the browser until the user chooses, and index.html does the same before the first paint.
import { useEffect, useState } from 'react';
import { readChoice, remember } from './remembered';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'curve.theme';
const PREFERS_DARK = '(prefers-color-scheme: dark)';

function chosenTheme(): Theme | null {
  const stored = readChoice(STORAGE_KEY);
  return stored === 'dark' || stored === 'light' ? stored : null;
}

const browserTheme = (): Theme => (window.matchMedia(PREFERS_DARK).matches ? 'dark' : 'light');

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [chosen, setChosen] = useState(chosenTheme);
  const [browser, setBrowser] = useState(browserTheme);
  const theme = chosen ?? browser;

  useEffect(() => {
    const query = window.matchMedia(PREFERS_DARK);
    const follow = () => setBrowser(browserTheme());
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Stored only once it is chosen, so until then it follows the browser.
  function choose(next: Theme) {
    remember(STORAGE_KEY, next);
    setChosen(next);
  }

  return [theme, choose];
}

export const currentTheme = () => document.documentElement.dataset.theme;

// A canvas does not follow the stylesheet by itself, so what draws on one has to be told.
export function onThemeChange(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
