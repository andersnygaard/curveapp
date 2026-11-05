// Turns what the user drew into what the engine runs. No rule about money or pensions lives here: each box says what it
// becomes, and shared.ts what they all share.
import type { Factor, GateSources, Model, Rule, Stock } from '../engine/engine';
import type { TaxedPension } from '../engine/norway';
import { DAYS_PER_YEAR, Timeline } from '../engine/timeline';
import { ageOn, startOfAge } from './ages';
import { specOf } from './catalog';
import { queryOf } from './query';
import { buildShared, declareShared } from './shared';
import type { BuildContext, Compiling, DeclareContext, Diagnostic } from './spec';
import type { Box, SimulationInput } from './types';

const MAX_SAMPLES = 400;

// How far ahead to look when nothing else is chosen.
export const DEFAULT_YEARS = 30;
export const LAST_AGE = 95;

function sampleDaysFor(totalDays: number): number[] {
  const sampleEvery = Math.ceil(totalDays / MAX_SAMPLES);
  const sampleDays: number[] = [];
  for (let day = 0; day < totalDays; day += sampleEvery) sampleDays.push(day);
  sampleDays.push(totalDays);
  return sampleDays;
}

// The box says whether it has a start, so a field that happens to be called startDate on another box moves nothing.
// A date that cannot be read counts as today (validDate), so compiling reads the clock.
const startDateOf = (box: Box) => specOf(box).startsOn?.(box) ?? null;

export function hasStocks({ boxes }: SimulationInput): boolean {
  return boxes.some((box) => startDateOf(box) !== null);
}

// The simulation starts when the first thing that holds value starts.
export function startMsOf({ boxes }: SimulationInput): number {
  return Math.min(...boxes.flatMap((box) => startDateOf(box) ?? []).map((date) => Date.parse(date)));
}

// How long the simulation must run to reach an age, or 0 without a birth year or if that age has passed.
export function yearsToAge(input: SimulationInput, age: number): number {
  const { birthYear } = queryOf(input).assumptions;
  if (birthYear === null || !hasStocks(input)) return 0;
  return Math.max(0, age - ageOn(new Date(startMsOf(input)), birthYear));
}

export function compile(input: SimulationInput, years: number): Model {
  const query = queryOf(input);
  const timeline = new Timeline(startMsOf(input), Math.round(years * DAYS_PER_YEAR));
  const stocks: Stock[] = [];
  const factors: Factor[] = [];
  const rules: Rule[] = [];
  const gateSources: GateSources[] = [];
  const pensions: TaxedPension[] = [];
  const stockIndex = new Map<string, number>();
  let random = false;

  const addRule = (rule: Rule) => {
    rules.push(rule);
  };

  const compiling: Compiling = {
    ...query,
    timeline,
    everyDay: timeline.fires({ every: 'daily' }),
    dayOfAge(age) {
      const { birthYear } = query.assumptions;
      if (birthYear === null || !Number.isFinite(age)) return null;
      return timeline.dayOfMs(startOfAge(birthYear, age));
    },
  };
  const declaring: DeclareContext = {
    ...compiling,
    addRule,
    addStock(box, stock) {
      stockIndex.set(box.id, stocks.length);
      return stocks.push({ id: box.id, ...stock }) - 1;
    },
    addFactor(factor, isRandom) {
      factors.push(factor);
      random ||= isRandom;
    },
  };
  const building: BuildContext = {
    ...compiling,
    addRule,
    // A box without a stock is wiring the catalog should have refused, so it is said here instead of read as undefined.
    stockOf(box) {
      const index = stockIndex.get(box.id);
      if (index === undefined) throw new Error(`${box.id} has no stock`);
      return index;
    },
    markMayFallShort(stock) {
      stocks[stock].mayFallShort = true;
    },
    addGateSources(sources) {
      gateSources.push(sources);
    },
    addPension(pension) {
      pensions.push(pension);
    },
  };

  declareShared(input, declaring);
  for (const box of input.boxes) specOf(box).declare?.(box, declaring);
  for (const box of input.boxes) specOf(box).build?.(box, building);
  buildShared(pensions, building);

  // Calculated balances go last, so they are not read as part of the savings.
  const shown = stocks.flatMap((stock, index) => (stock.hidden ? [] : [index]));
  const charted = [
    ...shown.filter((index) => stocks[index].unit === 'money'),
    ...shown.filter((index) => stocks[index].unit !== 'money'),
  ];

  return { timeline, stocks, factors, rules, sampleDays: sampleDaysFor(timeline.days), charted, gateSources, random };
}

export function diagnose(input: SimulationInput): Diagnostic[] {
  const query = queryOf(input);
  return input.boxes.flatMap((box) =>
    (specOf(box).check?.(box, query) ?? []).map((code): Diagnostic => ({ boxId: box.id, code })),
  );
}
