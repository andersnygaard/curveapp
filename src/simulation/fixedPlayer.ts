// A player with fixed, made-up numbers, so what shows a simulation can be tested without running one.
import type { StockSummary } from '../engine/statistics';
import { DAYS_PER_YEAR } from '../engine/timeline';
import { Player } from './player';

const START_MS = Date.UTC(2030, 0, 1);
const PASS_SCALES = [0.7, 1.3, 1];
const COMPLETED_PASSES = 2;

export interface FixedStock {
  id: string;
  name: string;
  // The median in a given year. NaN where the stock does not exist.
  line: (year: number) => number;
  summary?: Partial<StockSummary>;
}

interface Options {
  years?: number;
  stocks: FixedStock[];
  gates?: { id: string; name: string; heldShare: number }[];
}

export const growing = (start: number, rate: number) => (year: number) => start * (1 + rate) ** year;

export function fixedPlayer({ years = 30, stocks, gates = [] }: Options): Player {
  const sampleDays = Array.from({ length: years + 1 }, (_, year) => Math.round(year * DAYS_PER_YEAR));
  const seriesOf = (stock: FixedStock, scale: number) =>
    Float64Array.from(sampleDays, (_, year) => stock.line(year) * scale);

  const summaries = stocks.map((stock): StockSummary => {
    const median = seriesOf(stock, 1);
    const finite = Array.from(median).filter((value) => !Number.isNaN(value));
    return {
      id: stock.id,
      name: stock.name,
      currency: 'NOK',
      calculated: false,
      median,
      yMax: Math.max(...finite) * PASS_SCALES[1],
      lastValue: finite[finite.length - 1],
      closeDay: null,
      heldShare: null,
      afterTax: null,
      payoutPerYear: null,
      overview: null,
      ...stock.summary,
    };
  });
  const passes = PASS_SCALES.map((scale) => stocks.map((stock) => seriesOf(stock, scale)));

  const player = new Player(
    { startMs: START_MS, totalDays: sampleDays[years], sampleDays },
    years,
    { summary: { passes: 2000, stocks: summaries, gates }, passes },
  );
  player.history = passes.slice(0, COMPLETED_PASSES);
  player.current = passes[COMPLETED_PASSES];
  player.completed = COMPLETED_PASSES;
  player.progress = 0.5;
  return player;
}
