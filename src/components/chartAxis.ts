// What the charts have in common: the room around the plot and where the marks on the axes go.
import { DAY_MS, DAYS_PER_YEAR } from '../engine/timeline';

export const MARGIN = { top: 10, right: 10, bottom: 24, left: 64 };
// A mark on the time axis this close to the right edge ends there instead of being centred, so it is not cut off.
export const TICK_ROOM = 20;

// A round step between the lines across a chart, with at most four steps to the top. With 2.5 among the steps, a chart
// that reaches 8 million gets a line every 2.5 million and not only one at 5.
export function roundedStep(max: number): number {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
}

// A line may start late and stop early, where the values are NaN. An end between two samples stops partway to the next.
export function traceLine(
  target: CanvasRenderingContext2D,
  values: ArrayLike<number>,
  sampleDays: ArrayLike<number>,
  toX: (day: number) => number,
  toY: (value: number) => number,
  end = values.length - 1,
) {
  const whole = Math.floor(end);
  target.beginPath();
  let drawing = false;
  for (let sample = 0; sample <= whole; sample++) {
    if (Number.isNaN(values[sample])) {
      drawing = false;
      continue;
    }
    if (drawing) target.lineTo(toX(sampleDays[sample]), toY(values[sample]));
    else target.moveTo(toX(sampleDays[sample]), toY(values[sample]));
    drawing = true;
  }
  if (drawing && whole < values.length - 1 && !Number.isNaN(values[whole + 1])) {
    const part = end - whole;
    const day = sampleDays[whole] + (sampleDays[whole + 1] - sampleDays[whole]) * part;
    target.lineTo(toX(day), toY(values[whole] + (values[whole + 1] - values[whole]) * part));
  }
  target.stroke();
}

// The area between two lines. Where the values are NaN there is no band, so a gap splits it in two.
export function fillBand(
  target: CanvasRenderingContext2D,
  lower: ArrayLike<number>,
  upper: ArrayLike<number>,
  sampleDays: ArrayLike<number>,
  toX: (day: number) => number,
  toY: (value: number) => number,
) {
  target.beginPath();
  let from = 0;
  for (let sample = 0; sample <= lower.length; sample++) {
    if (sample < lower.length && !Number.isNaN(lower[sample]) && !Number.isNaN(upper[sample])) continue;
    if (sample > from) {
      target.moveTo(toX(sampleDays[from]), toY(upper[from]));
      for (let along = from + 1; along < sample; along++) target.lineTo(toX(sampleDays[along]), toY(upper[along]));
      for (let back = sample - 1; back >= from; back--) target.lineTo(toX(sampleDays[back]), toY(lower[back]));
      target.closePath();
    }
    from = sample + 1;
  }
  target.fill();
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
