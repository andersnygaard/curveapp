// What the charts drawn on a canvas have in common: the passes they read, the clock that draws them again, and the
// colours of the page.
import type { Layout } from '../engine/simulate';
import type { Summary } from '../engine/statistics';
import { onThemeChange } from '../theme';

// Adds a draw to those that run on each tick of the clock, and gives back what takes it off again.
export type RegisterDraw = (draw: () => void) => () => void;

// The passes as a chart reads them. Only the shape matters, so the player and the fixed numbers in the stories both fit.
// The summary, the pass being played and how far it has come change in place while the passes play, so a chart reads
// them each time it draws.
export interface PlayedPasses {
  readonly layout: Layout;
  summary: Summary;
  // All the passes that have come in, also those not played yet. A pass has a series for each stock in the summary.
  readonly arrived: readonly (readonly Float64Array[])[];
  current: readonly Float64Array[];
  // From 0 to 1.
  progress: number;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The colours and other tokens in styles.css, as the canvas sees them.
export function tokensOf(canvas: HTMLCanvasElement): (name: string) => string {
  const style = getComputedStyle(canvas);
  return (name) => style.getPropertyValue(name).trim();
}

// Draws now, and again on each tick, when the colours change and when the canvas changes size. Gives back what stops it.
export function followCanvas(canvas: HTMLCanvasElement, draw: () => void, registerDraw: RegisterDraw): () => void {
  draw();
  const unregister = registerDraw(draw);
  const stopWatching = onThemeChange(draw);
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  return () => {
    unregister();
    stopWatching();
    observer.disconnect();
  };
}
