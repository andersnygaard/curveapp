// What many passes add up to. The median, the share that holds and the scale are all read from real passes.
import type { Model, PassResult } from './engine';

// The most extreme passes may leave the top of the graph, which keeps the rest of the fan readable. Over many
// years the fan gets very wide, so the top is also limited by the median, which is what the graph is there to show.
const SCALE_PERCENTILE = 0.95;
const SCALE_LIMIT_IN_MEDIANS = 4;
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
  const middle = peak(median);
  const top = middle > 0 ? Math.min(high, SCALE_LIMIT_IN_MEDIANS * middle) : high;
  return Math.max(top, middle) * SCALE_MARGIN || 1;
}

const shareHeld = (results: PassResult[], stock: number) =>
  results.filter((result) => result.ledger.short[stock] === 0).length / results.length;

function lastFinite(series: Float64Array): number {
  for (let sample = series.length - 1; sample >= 0; sample--) {
    if (!Number.isNaN(series[sample])) return series[sample];
  }
  return 0;
}

// The first monthly payment as a yearly amount, so it says the same however the calendar years fall.
function medianPayout(results: PassResult[], stock: number): number | null {
  const value = medianOf(Float64Array.from(results, (result) => result.ledger.firstPayout[stock]));
  return value > 0 ? value * 12 : null;
}

function medianAfterTax(model: Model, results: PassResult[], stock: number, chart: number): number | null {
  const { taxOnGain } = model.stocks[stock];
  if (taxOnGain === undefined) return null;
  const last = model.sampleDays.length - 1;
  const value = medianOf(
    Float64Array.from(results, (result) => {
      const end = result.series[chart][last];
      return end - taxOnGain * Math.max(0, end - result.depositsAtEnd[stock]);
    }),
  );
  return Number.isNaN(value) ? null : value;
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
      payoutPerYear: medianPayout(results, stock),
    };
  });
  const gates = model.stocks.flatMap((stock, index): GateSummary[] =>
    stock.hidden && stock.canRunOut ? [{ id: stock.id, name: stock.name, heldShare: shareHeld(results, index) }] : [],
  );
  return { passes: results.length, stocks, gates };
}
