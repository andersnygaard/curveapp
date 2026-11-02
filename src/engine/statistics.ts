// What many passes add up to. The median, the share that holds and the scale are all read from real passes.
import type { Model, PassResult } from './engine';
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
  overview: OverviewSummary | null;
}

export interface OverviewLine {
  name: string;
  // Its place among the lines, including those that never pay, so that it stays the same one.
  slot: number;
  perMonth: Float64Array;
}

export interface OverviewSummary {
  // False when it reads nothing but calculated balances, so there is no total to show.
  hasBalance: boolean;
  deposits: Float64Array;
  // Null when none of the boxes has any, so there is nothing to draw.
  shield: Float64Array | null;
  // All that has left the boxes over the whole period.
  withdrawn: number;
  // The middle of each calendar year, which is what the lines have one value for.
  days: Float64Array;
  // Only the lines that pay something.
  lines: OverviewLine[];
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

// The middle day of each calendar year, and how many monthly payments the period has room for in it.
function calendarYears(timeline: Timeline) {
  const count = timeline.yearIndex(timeline.days) + 1;
  const first = new Float64Array(count).fill(Infinity);
  const last = new Float64Array(count);
  const months = new Float64Array(count);
  const paydays = timeline.fires({ every: 'monthly' });
  for (let day = 0; day <= timeline.days; day++) {
    const year = timeline.yearIndex(day);
    first[year] = Math.min(first[year], day);
    last[year] = day;
    months[year] += paydays[day];
  }
  return { days: first.map((day, year) => (day + last[year]) / 2), months };
}

function summarizeOverview(model: Model, results: PassResult[], index: number, earlier?: StockSummary): StockSummary {
  const { id, name, stocks, lines } = model.overviews[index];
  const samples = model.sampleDays.length;
  const totalOf: SeriesOf = (result) => result.overviews[index].total;
  const median = medianSeries(results, totalOf, samples);
  const deposits = medianSeries(results, (result) => result.overviews[index].deposits, samples);
  const shield = medianSeries(results, (result) => result.overviews[index].shield, samples);
  const { days, months } = calendarYears(model.timeline);
  const flowOf = (result: PassResult, label: string) => result.ledger.flows.get(label);
  const allOf = (flow?: Float64Array) => flow?.reduce((all, amount) => all + amount, 0) ?? 0;

  const paying = lines
    .map(({ name: lineName, label }, slot): OverviewLine => {
      const perYear = (year: number) => medianOf(Float64Array.from(results, (result) => flowOf(result, label)?.[year] ?? 0));
      return { name: lineName, slot, perMonth: days.map((_, year) => (months[year] > 0 ? perYear(year) / months[year] : 0)) };
    })
    .filter((line) => peak(line.perMonth) > 0);
  const withdrawn = medianOf(
    Float64Array.from(results, (result) => lines.reduce((sum, { label }) => sum + allOf(flowOf(result, label)), 0)),
  );

  return {
    id,
    name,
    currency: model.stocks[stocks[0]]?.currency ?? 'NOK',
    calculated: false,
    median,
    yMax: earlier?.yMax ?? Math.max(scaleOf(results, totalOf, median), Math.max(peak(deposits), peak(shield)) * SCALE_MARGIN),
    lastValue: lastFinite(median),
    closeDay: null,
    heldShare: null,
    afterTax: null,
    payoutPerYear: null,
    overview: {
      hasBalance: stocks.length > 0,
      deposits,
      shield: peak(shield) > 0 ? shield : null,
      withdrawn,
      days,
      lines: paying,
      perMonthMax:
        earlier?.overview?.perMonthMax ?? Math.max(1, ...paying.map((line) => peak(line.perMonth) * SCALE_MARGIN)),
    },
  };
}

// The scale is kept from the first summary, so the graph does not jump while the median settles. Overviews go first.
export function summarize(model: Model, results: PassResult[], earlier?: Summary): Summary {
  const samples = model.sampleDays.length;
  const overviews = model.overviews.map((_, index) => summarizeOverview(model, results, index, earlier?.stocks[index]));
  const stocks = model.charted.map((stock, chart): StockSummary => {
    const { id, name, currency, unit, canRunOut, closeDay } = model.stocks[stock];
    const seriesOf: SeriesOf = (result) => result.series[chart];
    const median = medianSeries(results, seriesOf, samples);
    return {
      id,
      name,
      currency,
      calculated: unit === 'notional',
      median,
      yMax: earlier?.stocks[overviews.length + chart].yMax ?? scaleOf(results, seriesOf, median),
      lastValue: lastFinite(median),
      closeDay: closeDay ?? null,
      heldShare: canRunOut ? shareHeld(results, stock) : null,
      afterTax: medianAfterTax(model, results, stock, chart),
      payoutPerYear: medianPayout(results, stock),
      overview: null,
    };
  });
  const gates = model.stocks.flatMap((stock, index): GateSummary[] =>
    stock.hidden && stock.canRunOut ? [{ id: stock.id, name: stock.name, heldShare: shareHeld(results, index) }] : [],
  );
  return { passes: results.length, stocks: [...overviews, ...stocks], gates };
}
