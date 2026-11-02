// What the charts have in common: the room around the plot and where the marks on the axes go.
import { DAY_MS, DAYS_PER_YEAR } from '../engine/timeline';

export const MARGIN = { top: 10, right: 10, bottom: 24, left: 64 };

export function roundedStep(max: number): number {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

// New Year's days along the time axis, as ages with a birth year and as years without one.
export function timeTicks(startMs: number, totalDays: number, birthYear: number | null): { day: number; tick: number }[] {
  const spanYears = totalDays / DAYS_PER_YEAR;
  const tickStep = spanYears <= 6 ? 1 : spanYears <= 11 ? 2 : spanYears <= 35 ? 5 : 10;
  const ticks: { day: number; tick: number }[] = [];
  for (let year = new Date(startMs).getUTCFullYear() + 1; ; year++) {
    const day = (Date.UTC(year, 0, 1) - startMs) / DAY_MS;
    if (day > totalDays) return ticks;
    const tick = birthYear === null ? year : year - birthYear;
    if (tick >= 0 && tick % tickStep === 0) ticks.push({ day, tick });
  }
}
