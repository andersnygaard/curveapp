// The written plan: what starts, changes and stops on which date, read from one pass without random shocks.
// It reads what the engine moved, so it cannot say anything else than what the simulation does. The flows it knows are
// named where the engine makes them, in rules.ts and norway.ts.
import { OUTSIDE, runPass, type Recorded, type Stock } from '../engine/engine';
import { OTP_DEPOSIT, TAX_ON_PENSION, WEALTH_TAX, WEALTH_TAX_GAIN, WEALTH_TAX_SHORT } from '../engine/norway';
import { noNoise } from '../engine/random';
import { payoutSource, SURPLUS, TAX_ON_GAIN, UNMET } from '../engine/rules';
import type { Timeline } from '../engine/timeline';
import { loanOn, valueOf } from './boxes/housing';
import { incomeOfLabel } from './boxes/pay';
import { compile, DEFAULT_YEARS, hasStocks, LAST_AGE, yearsToAge } from './compile';
import { assumptionsOf } from './query';
import type { Box, SimulationInput } from './types';

export type PlanFlow =
  | 'opening'
  | 'housing'
  | 'deposit'
  | 'pensionDeposit'
  | 'pension'
  | 'withdrawal'
  | 'tax'
  | 'wealthTax'
  | 'wealthTaxGain'
  | 'surplus'
  | 'move'
  | 'unmet'
  | 'wealthTaxShort';
export type PlanChange = 'starts' | 'changes' | 'stops';
export type PlanInterval = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'once';

export interface PlanLine {
  flow: PlanFlow;
  change: PlanChange;
  from: string | null;
  to: string | null;
  // The first and last payment until the next change. They differ when an amount follows G. For a flow that has one line
  // for as long as it lasts, they are the lowest and the highest.
  amount: number;
  lastAmount: number;
  every: PlanInterval;
  currency: string;
  // What a home has left to pay on the day its line is about.
  loan?: number;
}

export interface PlanBalance {
  name: string;
  amount: number;
  currency: string;
}

export interface PlanDate {
  day: number;
  dateMs: number;
  age: number | null;
  lines: PlanLine[];
  // What the accounts hold on the morning of the date.
  balances: PlanBalance[];
}

export interface Plan {
  dates: PlanDate[];
  years: number;
  toAge: number | null;
}

const FLOW_ORDER: PlanFlow[] = ['opening', 'housing', 'deposit', 'pensionDeposit', 'pension', 'withdrawal', 'tax', 'wealthTax', 'wealthTaxGain', 'surplus', 'move', 'unmet', 'wealthTaxShort'];
// Worked out from what the accounts hold, so the amount moves every year without anything having been decided. That is one
// line for as long as it lasts, from all the accounts together, and not a new one each year.
const ONE_LINE_FLOWS = new Map<string, PlanFlow>([
  [WEALTH_TAX, 'wealthTax'],
  [WEALTH_TAX_GAIN, 'wealthTaxGain'],
  [WEALTH_TAX_SHORT, 'wealthTaxShort'],
]);
const MONTHS_BETWEEN: Partial<Record<PlanInterval, number>> = { monthly: 1, quarterly: 3, yearly: 12 };

// Smaller payments are what is left of an account or a rounding, not something to plan for.
const SMALLEST_PAYMENT = 100;
// An amount that follows G rises a little every year. That is one line in the plan, not a new one each year.
const CHANGE_SHARE = 0.1;
const SMALLEST_CHANGE = 500;
const LONGEST_GAP_DAYS = 400;
// Trading days have a weekend between them.
const SHORTEST_ALLOWED_GAP_DAYS = 5;
// Room for one payment that did not come.
const SKIPPED_PAYMENT_GAPS = 2.5;

interface Payment {
  day: number;
  amount: number;
}

// Payments that belong together: the same flow at about the same amount with no pause.
interface Stretch {
  firstDay: number;
  lastDay: number;
  gap: number | null;
  first: number;
  last: number;
  payments: number;
}

interface FlowRun {
  flow: PlanFlow;
  from: string | null;
  to: string | null;
  currency: string;
  payments: Payment[];
}

function flowOf({ from, to, label }: Recorded, stocks: Stock[]): PlanFlow | null {
  if (label === TAX_ON_GAIN || label === TAX_ON_PENSION) return 'tax';
  if (from !== OUTSIDE && stocks[from].hidden) {
    if (label === UNMET) return 'unmet';
    // What the pension covers is already said by the lines for each pension.
    return label === SURPLUS ? 'surplus' : null;
  }
  if (payoutSource(label) !== null) return 'pension';
  if (from === OUTSIDE) return label === OTP_DEPOSIT ? 'pensionDeposit' : 'deposit';
  return to === OUTSIDE ? 'withdrawal' : 'move';
}

function sourceOf(flow: PlanFlow, { from, label }: Recorded, stocks: Stock[], boxes: Box[]): string | null {
  if (flow === 'pension') return stocks.find((stock) => stock.id === payoutSource(label))?.name ?? null;
  if (flow === 'deposit') return incomeOfLabel(label, boxes)?.data.name ?? null;
  return from === OUTSIDE ? null : stocks[from].name;
}

const allowedGap = (gap: number | null) => (gap === null ? LONGEST_GAP_DAYS : Math.max(gap * 1.5, SHORTEST_ALLOWED_GAP_DAYS));

const aboutTheSame = (amount: number, before: number) => Math.abs(amount - before) <= Math.max(before * CHANGE_SHARE, SMALLEST_CHANGE);

function continues(stretch: Stretch, { day, amount }: Payment, anyAmount: boolean): boolean {
  return day - stretch.lastDay <= allowedGap(stretch.gap) && (anyAmount || aboutTheSame(amount, stretch.last));
}

// The month an account runs out holds what was left in it, and the month a shortfall starts holds a part of it.
// A single payment like that belongs to the stretch next to it, and does not get a date of its own.
function withoutLonePayments(stretches: Stretch[]): Stretch[] {
  const kept: Stretch[] = [];
  stretches.forEach((stretch, index) => {
    const next = stretches[index + 1];
    const previous = kept.at(-1);
    if (stretch.payments === 1 && next && next.firstDay - stretch.lastDay <= allowedGap(next.gap)) {
      next.gap ??= next.firstDay - stretch.lastDay;
      next.firstDay = stretch.firstDay;
      next.payments++;
    } else if (stretch.payments === 1 && previous && stretch.lastDay - previous.lastDay <= allowedGap(previous.gap)) {
      previous.gap ??= stretch.lastDay - previous.lastDay;
      previous.lastDay = stretch.lastDay;
      previous.payments++;
    } else {
      kept.push(stretch);
    }
  });
  return kept;
}

// A yearly income pays for the month it comes, so what is drawn from the accounts is smaller or gone that month, every
// year. A weekly income comes to more in the months with five of them. That is one payment going on, and nothing to plan for.
function withoutSkippedPayments(stretches: Stretch[]): Stretch[] {
  const kept: Stretch[] = [];
  for (const stretch of stretches) {
    const previous = kept.at(-1);
    if (previous?.gap && stretch.firstDay - previous.lastDay <= previous.gap * SKIPPED_PAYMENT_GAPS && aboutTheSame(stretch.first, previous.last)) {
      previous.lastDay = stretch.lastDay;
      previous.last = stretch.last;
      previous.payments += stretch.payments;
    } else {
      kept.push(stretch);
    }
  }
  return kept;
}

function stretchesOf(payments: Payment[], anyAmount: boolean): Stretch[] {
  const stretches: Stretch[] = [];
  for (const payment of payments) {
    const { day, amount } = payment;
    const current = stretches.at(-1);
    if (current && continues(current, payment, anyAmount)) {
      current.gap ??= day - current.lastDay;
      current.lastDay = day;
      current.last = amount;
      current.payments++;
    } else {
      stretches.push({ firstDay: day, lastDay: day, gap: null, first: amount, last: amount, payments: 1 });
    }
  }
  return withoutSkippedPayments(withoutLonePayments(stretches));
}

function intervalOf(gap: number | null): PlanInterval {
  if (gap === null) return 'once';
  if (gap <= SHORTEST_ALLOWED_GAP_DAYS) return 'daily';
  if (gap <= 10) return 'weekly';
  if (gap <= 45) return 'monthly';
  return gap <= 120 ? 'quarterly' : 'yearly';
}

// The day the next payment would have come.
function dayAfter({ lastDay, gap }: Stretch, every: PlanInterval, timeline: Timeline): number {
  const months = MONTHS_BETWEEN[every];
  if (months === undefined) return lastDay + (gap ?? 1);
  const date = timeline.dateOf(lastDay);
  return timeline.dayOfMs(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

// The first and last amount of a stretch. Something on one line for long can rise and then fall, and its range must still say
// how high it went. Otherwise the last payment of a pension empties it and is a little different, so only a real rise counts.
function amountsOf(stretch: Stretch, payments: Payment[], oneLine: boolean): { amount: number; lastAmount: number } {
  if (oneLine) {
    const amounts = payments.filter(({ day }) => day >= stretch.firstDay && day <= stretch.lastDay).map(({ amount }) => amount);
    return { amount: Math.min(...amounts), lastAmount: Math.max(...amounts) };
  }
  const rises = Math.abs(stretch.last - stretch.first) > stretch.first * CHANGE_SHARE;
  return { amount: stretch.first, lastAmount: rises ? stretch.last : stretch.first };
}

function linesOfRun({ flow, from, to, currency, payments }: FlowRun, timeline: Timeline): [number, PlanLine][] {
  const oneLine = [...ONE_LINE_FLOWS.values()].includes(flow);
  const planned = payments.filter(({ amount }) => amount >= SMALLEST_PAYMENT);
  const stretches = stretchesOf(planned, oneLine);
  let previousEnd = -Infinity;
  return stretches.flatMap((stretch, index): [number, PlanLine][] => {
    const every = intervalOf(stretch.gap);
    const end = dayAfter(stretch, every, timeline);
    const line = { flow, from, to, ...amountsOf(stretch, planned, oneLine), every, currency };
    const change: PlanChange = stretch.firstDay <= previousEnd ? 'changes' : 'starts';
    const lines: [number, PlanLine][] = [[stretch.firstDay, { ...line, change }]];
    const next = stretches[index + 1];
    if (every !== 'once' && end <= timeline.days && !(next && next.firstDay <= end)) {
      lines.push([end, { ...line, change: 'stops' }]);
    }
    previousEnd = end;
    return lines;
  });
}

function openingLine({ name, opening, currency }: Stock): PlanLine {
  return { flow: 'opening', change: 'starts', from: null, to: name, amount: opening, lastAmount: opening, every: 'once', currency };
}

// A home moves no money, so the engine has nothing to say about it and its lines come from the box. Without a date the
// day is not a number, so nothing below holds: the loan stays as it is and has no day it is paid off.
function housingLines(boxes: Box[], timeline: Timeline): [number, PlanLine][] {
  return boxes.flatMap((box): [number, PlanLine][] => {
    if (box.type !== 'housing') return [];
    const value = valueOf(box);
    const paidOffDay = timeline.dayOf(box.data.paidOff);
    const loan = loanOn(box, 0, paidOffDay);
    const line ={ flow: 'housing', from: box.data.name, to: null, amount: value, lastAmount: value, every: 'once', currency: 'NOK' } as const;
    const lines: [number, PlanLine][] = [];
    if (value > 0 || loan > 0) lines.push([0, { ...line, change: 'starts', loan }]);
    if (loan > 0 && paidOffDay <= timeline.days) lines.push([paidOffDay, { ...line, change: 'stops' }]);
    return lines;
  });
}

// A line that only says what is already there. The accounts it names hold just that, so there are no balances to add.
const saysWhatIsThere = ({ flow, change }: PlanLine) => change === 'starts' && (flow === 'opening' || flow === 'housing');

export function planOf(input: SimulationInput): Plan {
  const yearsToLastAge = yearsToAge(input, LAST_AGE);
  const years = yearsToLastAge || DEFAULT_YEARS;
  const toAge = yearsToLastAge > 0 ? LAST_AGE : null;
  if (!hasStocks(input)) return { dates: [], years, toAge };

  const model = compile(input, years);
  const { stocks, timeline, charted } = model;
  const runs = new Map<string, FlowRun>();
  runPass(model, noNoise, (recorded) => {
    const { day, from, to, amount, label } = recorded;
    const oneLine = ONE_LINE_FLOWS.get(label);
    const flow = oneLine ?? flowOf(recorded, stocks);
    if (!flow) return;
    const key = oneLine ?? `${flow}|${from}|${to}|${label}`;
    let run = runs.get(key);
    if (!run) {
      const owner = stocks[from] ?? stocks[to];
      run = {
        flow,
        from: oneLine ? null : sourceOf(flow, recorded, stocks, input.boxes),
        to: to === OUTSIDE ? null : stocks[to].name,
        currency: owner?.currency ?? 'NOK',
        payments: [],
      };
      runs.set(key, run);
    }
    const last = run.payments.at(-1);
    if (last?.day === day) last.amount += amount;
    else run.payments.push({ day, amount });
  });

  const openings = stocks
    .filter((stock) => !stock.hidden && stock.opening > 0 && stock.openDay <= timeline.days)
    .map((stock): [number, PlanLine] => [stock.openDay, openingLine(stock)]);
  const linesByDay = new Map<number, PlanLine[]>();
  const flows = [...runs.values()].flatMap((run) => linesOfRun(run, timeline));
  for (const [day, line] of [...openings, ...housingLines(input.boxes, timeline), ...flows]) {
    linesByDay.set(day, [...(linesByDay.get(day) ?? []), line]);
  }

  const days = [...linesByDay.keys()].sort((a, b) => a - b);
  const { series } = runPass({ ...model, sampleDays: days }, noNoise);
  const { birthYear } = assumptionsOf(input.boxes);
  const dates = days.map((day, sample): PlanDate => {
    const lines = linesByDay.get(day)!;
    const balances = lines.every(saysWhatIsThere)
      ? []
      : charted.flatMap((stock, chart): PlanBalance[] => {
          const { name, unit, currency } = stocks[stock];
          const amount = series[chart][sample];
          return unit === 'money' && amount >= 1 ? [{ name, amount, currency }] : [];
        });
    return {
      day,
      dateMs: timeline.dateOf(day).getTime(),
      age: birthYear === null ? null : timeline.dateOf(day).getUTCFullYear() - birthYear,
      lines: [...lines].sort((a, b) => FLOW_ORDER.indexOf(a.flow) - FLOW_ORDER.indexOf(b.flow)),
      balances,
    };
  });
  return { dates, years, toAge };
}
