// A player with fixed, made-up numbers, so what shows a simulation can be tested without running one.
import type { StockSummary, WithdrawalSummary } from '../engine/statistics';
import { DAYS_PER_YEAR } from '../engine/timeline';
import { Player } from './player';

const START_MS = Date.UTC(2030, 0, 1);
const PASS_SCALES = [0.7, 1.3, 1];
const SPREAD_SCALES = { p10: 0.7, p25: 0.85, p75: 1.15, p90: 1.3 };
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
  withdrawals?: WithdrawalSummary[];
}

export const growing = (start: number, rate: number) => (year: number) => start * (1 + rate) ** year;

export function fixedPlayer({ years = 30, stocks, gates = [], withdrawals = [] }: Options): Player {
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
      spread: {
        p10: seriesOf(stock, SPREAD_SCALES.p10),
        p25: seriesOf(stock, SPREAD_SCALES.p25),
        p75: seriesOf(stock, SPREAD_SCALES.p75),
        p90: seriesOf(stock, SPREAD_SCALES.p90),
      },
      yMax: Math.max(...finite) * SPREAD_SCALES.p90,
      lastValue: finite[finite.length - 1],
      closeDay: null,
      heldShare: null,
      afterTax: null,
      payoutPerYear: null,
      deposits: null,
      shield: null,
      ...stock.summary,
    };
  });
  const passes = PASS_SCALES.map((scale) => stocks.map((stock) => seriesOf(stock, scale)));

  const player = new Player(
    { startMs: START_MS, totalDays: sampleDays[years], sampleDays },
    years,
    { summary: { passes: 2000, stocks: summaries, gates, withdrawals }, passes },
  );
  player.current = passes[COMPLETED_PASSES];
  player.completed = COMPLETED_PASSES;
  player.progress = 0.5;
  return player;
}
