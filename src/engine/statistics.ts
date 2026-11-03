// What many passes add up to. The median, the share that holds and the scale are all read from real passes.
import type { Model, PassResult } from './engine';
import { neededBy, passedOnBy, shortAt, taxPaidAt } from './rules';
import type { Timeline } from './timeline';

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
  // What is left of what was put in. Null where it means nothing, which is without tax on the gain.
  deposits: Float64Array | null;
  // Null when there is none, so there is nothing to draw.
  shield: Float64Array | null;
}

export interface WithdrawalSource {
  name: string;
  // Its place among the sources, including those that never pay, so that it stays the same one.
  slot: number;
  perMonth: Float64Array;
}

// What a gate has to pay and what it is paid from, after tax, in kroner a month for each calendar year. The values are
// means over the passes and not medians, since means add up: the sources always come to the need, plus surplus, less short.
export interface WithdrawalSummary {
  id: string;
  name: string;
  currency: string;
  // Where each calendar year begins, and last where the final one ends.
  yearEdges: Float64Array;
  // Only the sources that pay something.
  sources: WithdrawalSource[];
  need: Float64Array;
  surplus: Float64Array;
  short: Float64Array;
  tax: Float64Array;
  surplusTo: string | null;
  // All that the sources have paid over the whole period after tax, and the tax on top of it.
  withdrawn: number;
  taxPaid: number;
  perMonthMax: number;
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
  withdrawals: WithdrawalSummary[];
}

function medianOf(values: Float64Array): number {
  values.sort();
  let count = values.length;
  while (count > 0 && Number.isNaN(values[count - 1])) count--;
  if (count === 0) return NaN;
  return (values[(count - 1) >> 1] + values[count >> 1]) / 2;
}

type SeriesOf = (result: PassResult) => Float64Array;

function medianSeries(results: PassResult[], seriesOf: SeriesOf, samples: number): Float64Array {
  const median = new Float64Array(samples);
  const values = new Float64Array(results.length);
  for (let sample = 0; sample < samples; sample++) {
    for (let pass = 0; pass < results.length; pass++) values[pass] = seriesOf(results[pass])[sample];
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

function scaleOf(results: PassResult[], seriesOf: SeriesOf, median: Float64Array): number {
  const peaks = Float64Array.from(results, (result) => peak(seriesOf(result))).sort();
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
      return end - taxOnGain * Math.max(0, end - result.depositsAtEnd[stock] - result.shieldAtEnd[stock]);
    }),
  );
  return Number.isNaN(value) ? null : value;
}

// Where each calendar year begins, and how many monthly payments the period has room for in it.
function calendarYears(timeline: Timeline) {
  const count = timeline.yearIndex(timeline.days) + 1;
  const edges = new Float64Array(count + 1).fill(Infinity);
  const months = new Float64Array(count);
  const paydays = timeline.fires({ every: 'monthly' });
  for (let day = 0; day <= timeline.days; day++) {
    const year = timeline.yearIndex(day);
    edges[year] = Math.min(edges[year], day);
    months[year] += paydays[day];
  }
  edges[count] = timeline.days;
  return { edges, months };
}

function summarizeWithdrawal(model: Model, results: PassResult[], index: number, earlier?: Summary): WithdrawalSummary {
  const { gate, sources, surplusTo } = model.gateSources[index];
  const { id, name, currency } = model.stocks[gate];
  const { edges, months } = calendarYears(model.timeline);
  const flowOf = (result: PassResult, label: string) => result.ledger.flows.get(label);
  const perMonthOf = (label: string, keeps = 1) =>
    Float64Array.from(months, (paydays, year) =>
      paydays > 0 ? (keeps * results.reduce((sum, result) => sum + (flowOf(result, label)?.[year] ?? 0), 0)) / results.length / paydays : 0,
    );
  const allOf = (flow?: Float64Array) => flow?.reduce((all, amount) => all + amount, 0) ?? 0;

  const paying = sources
    .map(({ name: sourceName, label, keeps }, slot): WithdrawalSource => ({ name: sourceName, slot, perMonth: perMonthOf(label, keeps) }))
    .filter((source) => peak(source.perMonth) > 0);
  const need = perMonthOf(neededBy(gate));
  const tax = perMonthOf(taxPaidAt(gate));
  const highest = months.map((_, year) =>
    Math.max(paying.reduce((sum, source) => sum + source.perMonth[year], 0), need[year]) + tax[year],
  );

  return {
    id,
    name,
    currency,
    yearEdges: edges,
    sources: paying,
    need,
    surplus: perMonthOf(passedOnBy(gate)),
    short: perMonthOf(shortAt(gate)),
    tax,
    surplusTo,
    withdrawn: medianOf(
      Float64Array.from(results, (result) =>
        sources.reduce((sum, { label, keeps = 1 }) => sum + keeps * allOf(flowOf(result, label)), 0),
      ),
    ),
    taxPaid: medianOf(Float64Array.from(results, (result) => allOf(flowOf(result, taxPaidAt(gate))))),
    perMonthMax:
      earlier?.withdrawals.find((withdrawal) => withdrawal.id === id)?.perMonthMax ?? Math.max(1, peak(highest) * SCALE_MARGIN),
  };
}

// The scale is kept from the first summary, so the graph does not jump while the median settles.
export function summarize(model: Model, results: PassResult[], earlier?: Summary): Summary {
  const samples = model.sampleDays.length;
  const stocks = model.charted.map((stock, chart): StockSummary => {
    const { id, name, currency, unit, canRunOut, closeDay, taxOnGain } = model.stocks[stock];
    const seriesOf: SeriesOf = (result) => result.series[chart];
    const median = medianSeries(results, seriesOf, samples);
    const taxed = taxOnGain !== undefined;
    const deposits = taxed ? medianSeries(results, (result) => result.deposits[chart]!, samples) : null;
    const shield = taxed ? medianSeries(results, (result) => result.shield[chart]!, samples) : null;
    return {
      id,
      name,
      currency,
      calculated: unit === 'notional',
      median,
      yMax:
        earlier?.stocks[chart].yMax ??
        Math.max(scaleOf(results, seriesOf, median), Math.max(peak(deposits ?? []), peak(shield ?? [])) * SCALE_MARGIN),
      lastValue: lastFinite(median),
      closeDay: closeDay ?? null,
      heldShare: canRunOut ? shareHeld(results, stock) : null,
      afterTax: medianAfterTax(model, results, stock, chart),
      payoutPerYear: medianPayout(results, stock),
      deposits,
      shield: peak(shield ?? []) > 0 ? shield : null,
    };
  });
  const gates = model.stocks.flatMap((stock, index): GateSummary[] =>
    stock.hidden && stock.canRunOut ? [{ id: stock.id, name: stock.name, heldShare: shareHeld(results, index) }] : [],
  );
  const withdrawals = model.gateSources
    .map((_, index) => summarizeWithdrawal(model, results, index, earlier))
    .filter((withdrawal) => withdrawal.sources.length > 0);
  return { passes: results.length, stocks, gates, withdrawals };
}
