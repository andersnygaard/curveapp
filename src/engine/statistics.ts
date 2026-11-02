// What many passes add up to. The median, the share that holds and the scale are all read from real passes.
import type { Model, PassResult } from './engine';

// The most extreme passes may leave the top of the graph, which keeps the rest of the fan readable.
const SCALE_PERCENTILE = 0.95;
const SCALE_MARGIN = 1.05;

export interface StockSummary {
  id: string;
  name: string;
  currency: string;
  calculated: boolean;
  median: Float64Array;
  yMax: number;
  // The last value on the line, and the day it stops if it stops early.
  lastValue: number;
  closeDay: number | null;
  // The share of passes where everything asked of this stock was paid. Null if nothing can run out.
  heldShare: number | null;
  afterTax: number | null;
  payoutPerYear: number | null;
}

export interface GateSummary {
  id: string;
  name: string;
  heldShare: number;
}

export interface Summary {
  passes: number;
  stocks: StockSummary[];
  gates: GateSummary[];
}

function medianOf(values: Float64Array): number {
  values.sort();
  let count = values.length;
  while (count > 0 && Number.isNaN(values[count - 1])) count--;
  if (count === 0) return NaN;
  return (values[(count - 1) >> 1] + values[count >> 1]) / 2;
}

function medianSeries(results: PassResult[], chart: number, samples: number): Float64Array {
  const median = new Float64Array(samples);
  const values = new Float64Array(results.length);
  for (let sample = 0; sample < samples; sample++) {
    for (let pass = 0; pass < results.length; pass++) values[pass] = results[pass].series[chart][sample];
    median[sample] = medianOf(values);
  }
  return median;
}

function peak(series: ArrayLike<number>): number {
  let highest = 0;
  for (let sample = 0; sample < series.length; sample++) {
    if (series[sample] > highest) highest = series[sample];
  }
  return highest;
}

function scaleOf(results: PassResult[], chart: number, median: Float64Array): number {
  const peaks = Float64Array.from(results, (result) => peak(result.series[chart])).sort();
  const high = peaks[Math.min(peaks.length - 1, Math.floor(peaks.length * SCALE_PERCENTILE))];
  return Math.max(high, peak(median)) * SCALE_MARGIN || 1;
}

const shareHeld = (results: PassResult[], stock: number) =>
  results.filter((result) => result.ledger.short[stock] === 0).length / results.length;

function lastFinite(series: Float64Array): number {
  for (let sample = series.length - 1; sample >= 0; sample--) {
    if (!Number.isNaN(series[sample])) return series[sample];
  }
  return 0;
}

function medianPayout(model: Model, results: PassResult[], stock: number): number | null {
  const { payout } = model.stocks[stock];
  if (!payout) return null;
  // The first whole calendar year of payments.
  const year = model.timeline.yearIndex(Math.max(0, payout.fromDay)) + 1;
  const paid = Float64Array.from(results, (result) => result.ledger.flows.get(payout.label)?.[year] ?? NaN);
  const value = medianOf(paid);
  return Number.isNaN(value) ? null : value;
}

function medianAfterTax(model: Model, results: PassResult[], stock: number, chart: number): number | null {
  const { taxOnGain } = model.stocks[stock];
  if (taxOnGain === undefined) return null;
  const last = model.sampleDays.length - 1;
  return medianOf(
    Float64Array.from(results, (result) => {
      const value = result.series[chart][last];
      return value - taxOnGain * Math.max(0, value - result.depositsAtEnd[stock]);
    }),
  );
}

// The scale is kept from the first summary, so the graph does not jump while the median settles.
export function summarize(model: Model, results: PassResult[], earlier?: Summary): Summary {
  const samples = model.sampleDays.length;
  const stocks = model.charted.map((stock, chart): StockSummary => {
    const { id, name, currency, unit, canRunOut, closeDay } = model.stocks[stock];
    const median = medianSeries(results, chart, samples);
    return {
      id,
      name,
      currency,
      calculated: unit === 'notional',
      median,
      yMax: earlier?.stocks[chart].yMax ?? scaleOf(results, chart, median),
      lastValue: lastFinite(median),
      closeDay: closeDay ?? null,
      heldShare: canRunOut ? shareHeld(results, stock) : null,
      afterTax: medianAfterTax(model, results, stock, chart),
      payoutPerYear: medianPayout(model, results, stock),
    };
  });
  const gates = model.stocks.flatMap((stock, index): GateSummary[] =>
    stock.hidden && stock.canRunOut ? [{ id: stock.id, name: stock.name, heldShare: shareHeld(results, index) }] : [],
  );
  return { passes: results.length, stocks, gates };
}
