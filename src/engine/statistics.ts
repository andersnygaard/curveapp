// What many passes add up to. The median, the bands, the share that holds and the scale are all read from real passes.
import type { Model, PassResult } from './engine';
import { afterTaxOf, WEALTH_TAX, WEALTH_TAX_GAIN } from './norway';
import { needAt, shortAt, surplusAt, taxAt } from './rules';
import type { Timeline } from './timeline';

const SPREAD_SHARES = [0.1, 0.25, 0.5, 0.75, 0.9];

// The top of the graph follows the upper edge of the band. The scale is set from the first passes, and that edge still
// moves a little when more come in, so it gets some room. Over many years the band gets very wide, so the top is also
// limited by the median, which keeps the median and the bad passes readable while the best ones leave the graph.
const ROOM_ABOVE_BAND = 1.15;
const SCALE_LIMIT_IN_MEDIANS = 4;
const SCALE_MARGIN = 1.05;

// Where the passes lie at each sample. A tenth of them are below p10 and a tenth are above p90.
export interface Spread {
  p10: Float64Array;
  p25: Float64Array;
  p75: Float64Array;
  p90: Float64Array;
}

export interface StockSummary {
  id: string;
  name: string;
  currency: string;
  calculated: boolean;
  median: Float64Array;
  spread: Spread;
  yMax: number;
  // The last value on the line, and the day it stops if it stops early.
  lastValue: number;
  closeDay: number | null;
  // The share of passes where everything asked of this stock was paid. Null if it cannot fall short.
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
  // It belongs to no gate, so the first one shows it from the year it starts. The tax on gains to pay it is part of tax.
  wealthTax: Float64Array;
  surplusTo: string | null;
  // All that the sources have paid over the whole period after tax, and the tax on top of it. These are said in words,
  // so they are medians like the other figures.
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

// Sorts the values, which puts any NaN last, and returns how many are numbers.
function sortNumbers(values: Float64Array): number {
  values.sort();
  let count = values.length;
  while (count > 0 && Number.isNaN(values[count - 1])) count--;
  return count;
}

// A share that falls between two passes lies between their values, so the median of an even number is halfway.
function percentileOf(sorted: Float64Array, count: number, share: number): number {
  if (count === 0) return NaN;
  const at = share * (count - 1);
  const below = Math.floor(at);
  const low = sorted[below];
  const high = sorted[Math.ceil(at)];
  const part = at - below;
  return low === high ? low : low * (1 - part) + high * part;
}

function medianOf(values: Float64Array): number {
  return percentileOf(values, sortNumbers(values), 0.5);
}

type SeriesOf = (result: PassResult) => Float64Array;

function percentileSeries(results: PassResult[], seriesOf: SeriesOf, samples: number, shares: number[]): Float64Array[] {
  const series = shares.map(() => new Float64Array(samples));
  const values = new Float64Array(results.length);
  for (let sample = 0; sample < samples; sample++) {
    for (let pass = 0; pass < results.length; pass++) values[pass] = seriesOf(results[pass])[sample];
    const count = sortNumbers(values);
    shares.forEach((share, index) => {
      series[index][sample] = percentileOf(values, count, share);
    });
  }
  return series;
}

const medianSeries = (results: PassResult[], seriesOf: SeriesOf, samples: number) =>
  percentileSeries(results, seriesOf, samples, [0.5])[0];

function peak(series: ArrayLike<number>): number {
  let highest = 0;
  for (let sample = 0; sample < series.length; sample++) {
    if (series[sample] > highest) highest = series[sample];
  }
  return highest;
}

function scaleOf(upperEdge: Float64Array, median: Float64Array): number {
  const high = peak(upperEdge) * ROOM_ABOVE_BAND;
  const middle = peak(median);
  const top = middle > 0 ? Math.min(high, SCALE_LIMIT_IN_MEDIANS * middle) : high;
  return Math.max(top, middle) * SCALE_MARGIN || 1;
}

const shareHeld = (results: PassResult[], stock: number) =>
  results.filter((result) => result.ledger.short[stock] === 0).length / results.length;

export function lastFinite(series: Float64Array): number {
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
    Float64Array.from(results, (result) =>
      afterTaxOf(result.series[chart][last], result.depositsAtEnd[stock], result.shieldAtEnd[stock], taxOnGain),
    ),
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

type CalendarYears = ReturnType<typeof calendarYears>;

function summarizeWithdrawal(
  model: Model,
  results: PassResult[],
  index: number,
  { edges, months }: CalendarYears,
  showsWealthTax: boolean,
  earlier?: Summary,
): WithdrawalSummary {
  const { gate, sources, surplusTo } = model.gateSources[index];
  const { id, name, currency } = model.stocks[gate];
  const flowOf = (result: PassResult, label: string) => result.ledger.flows.get(label);
  // A pass's amount in a calendar year, as a mean over the passes, so the layers add up.
  const meanIn = (label: string, year: number) =>
    results.reduce((sum, result) => sum + (flowOf(result, label)?.[year] ?? 0), 0) / results.length;
  // Paid with the monthly payments, so spread over the paydays the calendar year has.
  const perPayday = (label: string) =>
    Float64Array.from(months, (paydays, year) => (paydays > 0 ? meanIn(label, year) / paydays : 0));
  const totalOf = (flow?: Float64Array) => flow?.reduce((all, amount) => all + amount, 0) ?? 0;

  const paying = sources
    .map(({ name: sourceName, label }, slot): WithdrawalSource => ({ name: sourceName, slot, perMonth: perPayday(label) }))
    .filter((source) => peak(source.perMonth) > 0);
  const need = perPayday(needAt(gate));
  // The wealth tax belongs to no gate. The first one that is paid anything shows it, while it needs something.
  const showsWealthTaxIn = (year: number) => showsWealthTax && need[year] > 0;
  // Paid once a year, so a twelfth of it whatever the calendar year has room for, also the first year that may be short.
  const perTwelfth = (label: string) =>
    Float64Array.from(need, (_, year) => (showsWealthTaxIn(year) ? meanIn(label, year) / 12 : 0));
  const wealthTax = perTwelfth(WEALTH_TAX);
  const gainOnWealthTax = perTwelfth(WEALTH_TAX_GAIN);
  const tax = perPayday(taxAt(gate)).map((amount, year) => amount + gainOnWealthTax[year]);
  const totalWhileShown = (flow?: Float64Array) =>
    flow?.reduce((all, amount, year) => all + (showsWealthTaxIn(year) ? amount : 0), 0) ?? 0;
  const highest = months.map((_, year) =>
    Math.max(paying.reduce((sum, source) => sum + source.perMonth[year], 0), need[year]) + tax[year] + wealthTax[year],
  );

  return {
    id,
    name,
    currency,
    yearEdges: edges,
    sources: paying,
    need,
    surplus: perPayday(surplusAt(gate)),
    short: perPayday(shortAt(gate)),
    tax,
    wealthTax,
    surplusTo,
    withdrawn: medianOf(
      Float64Array.from(results, (result) =>
        sources.reduce((sum, { label }) => sum + totalOf(flowOf(result, label)), 0),
      ),
    ),
    taxPaid: medianOf(
      Float64Array.from(
        results,
        (result) =>
          totalOf(flowOf(result, taxAt(gate))) +
          totalWhileShown(flowOf(result, WEALTH_TAX)) +
          totalWhileShown(flowOf(result, WEALTH_TAX_GAIN)),
      ),
    ),
    perMonthMax:
      earlier?.withdrawals.find((withdrawal) => withdrawal.id === id)?.perMonthMax ?? Math.max(1, peak(highest) * SCALE_MARGIN),
  };
}

// The scale is kept from the first summary, so the graph does not jump while the median settles.
export function summarize(model: Model, results: PassResult[], earlier?: Summary): Summary {
  const samples = model.sampleDays.length;
  const stocks = model.charted.map((stock, chart): StockSummary => {
    const { id, name, currency, unit, mayFallShort, closeDay, taxOnGain } = model.stocks[stock];
    const seriesOf: SeriesOf = (result) => result.series[chart];
    const [p10, p25, median, p75, p90] = percentileSeries(results, seriesOf, samples, SPREAD_SHARES);
    const taxed = taxOnGain !== undefined;
    const deposits = taxed ? medianSeries(results, (result) => result.deposits[chart]!, samples) : null;
    const shield = taxed ? medianSeries(results, (result) => result.shield[chart]!, samples) : null;
    return {
      id,
      name,
      currency,
      calculated: unit === 'calculated',
      median,
      spread: { p10, p25, p75, p90 },
      yMax:
        earlier?.stocks[chart].yMax ??
        Math.max(scaleOf(p90, median), Math.max(peak(deposits ?? []), peak(shield ?? [])) * SCALE_MARGIN),
      lastValue: lastFinite(median),
      closeDay: closeDay ?? null,
      heldShare: mayFallShort ? shareHeld(results, stock) : null,
      afterTax: medianAfterTax(model, results, stock, chart),
      payoutPerYear: medianPayout(results, stock),
      deposits,
      shield: peak(shield ?? []) > 0 ? shield : null,
    };
  });
  const gates = model.stocks.flatMap((stock, index): GateSummary[] =>
    stock.hidden && stock.mayFallShort ? [{ id: stock.id, name: stock.name, heldShare: shareHeld(results, index) }] : [],
  );
  const years = calendarYears(model.timeline);
  // A gate that nothing pays gets no chart, so the first one that does shows the wealth tax.
  const withdrawals: WithdrawalSummary[] = [];
  model.gateSources.forEach((_, index) => {
    const withdrawal = summarizeWithdrawal(model, results, index, years, withdrawals.length === 0, earlier);
    if (withdrawal.sources.length > 0) withdrawals.push(withdrawal);
  });
  return { passes: results.length, stocks, gates, withdrawals };
}
