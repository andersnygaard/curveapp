import { DEFAULT_YEARS } from '../model/compile';

// How far ahead the simulation looks: a number of years, or to the last age on the scale.
export type Horizon = number | 'lastAge';

export const HORIZONS = [5, 10, 20, 30];

// The last age needs a birth year. Without one it falls back to the default period.
export function yearsOf(horizon: Horizon, yearsToLastAge: number): number {
  if (horizon !== 'lastAge') return horizon;
  return yearsToLastAge > 0 ? yearsToLastAge : DEFAULT_YEARS;
}
