// Dark or light. It follows the browser until the user chooses, and index.html does the same before the first paint.
import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'curve.theme';
const PREFERS_DARK = '(prefers-color-scheme: dark)';

function chosenTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
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

  function choose(next: Theme) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked. The choice then lasts until the page is reloaded.
    }
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
