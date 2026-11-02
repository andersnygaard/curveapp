// The written plan: what starts, changes and stops on which date, read from one pass without random shocks.
// It reads what the engine moved, so it cannot say anything else than what the simulation does.
import { OUTSIDE, runPass, type Recorded, type Stock } from '../engine/engine';
import { noNoise } from '../engine/random';
import type { Timeline } from '../engine/timeline';
import { compile, DEFAULT_YEARS, hasStocks, LAST_AGE, yearsToAge } from './compile';
import { assumptionsOf } from './query';
import type { Box, SimulationInput } from './types';

export type PlanFlow = 'opening' | 'deposit' | 'pensionDeposit' | 'pension' | 'withdrawal' | 'surplus' | 'move' | 'unmet';
export type PlanChange = 'starts' | 'changes' | 'stops';
export type PlanInterval = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'once';

export interface PlanLine {
  flow: PlanFlow;
  change: PlanChange;
  from: string | null;
  to: string | null;
  // The first and last payment until the next change. They differ when an amount follows G.
  amount: number;
  lastAmount: number;
  every: PlanInterval;
  currency: string;
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

const PAYOUT_PREFIX = 'payout:';
const FLOW_ORDER: PlanFlow[] = ['opening', 'deposit', 'pensionDeposit', 'pension', 'withdrawal', 'surplus', 'move', 'unmet'];
const MONTHS_BETWEEN: Partial<Record<PlanInterval, number>> = { monthly: 1, quarterly: 3, yearly: 12 };

// Smaller payments are what is left of an account or a rounding, not something to plan for.
const SMALLEST_PAYMENT = 100;
// An amount that follows G rises a little every year. That is one line in the plan, not a new one each year.
const CHANGE_SHARE = 0.1;
const SMALLEST_CHANGE = 500;
const LONGEST_GAP_DAYS = 400;
// Trading days have a weekend between them.
const SHORTEST_ALLOWED_GAP_DAYS = 5;

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
  if (from !== OUTSIDE && stocks[from].hidden) {
    if (label === 'unmet') return 'unmet';
    // What the pension covers is already said by the lines for each pension.
    return label === 'surplus' ? 'surplus' : null;
  }
  if (label.startsWith(PAYOUT_PREFIX)) return 'pension';
  if (from === OUTSIDE) return label === 'otp:deposit' ? 'pensionDeposit' : 'deposit';
  return to === OUTSIDE ? 'withdrawal' : 'move';
}

function sourceOf(flow: PlanFlow, { from, label }: Recorded, stocks: Stock[], boxes: Box[]): string | null {
  if (flow === 'pension') return stocks.find((stock) => stock.id === label.slice(PAYOUT_PREFIX.length))?.name ?? null;
  if (flow === 'deposit') {
    const income = boxes.find((box) => box.type === 'income' && label.startsWith(`${box.id}:`));
    return income?.type === 'income' ? income.data.name : null;
  }
  return from === OUTSIDE ? null : stocks[from].name;
}

const allowedGap = (gap: number | null) => (gap === null ? LONGEST_GAP_DAYS : Math.max(gap * 1.5, SHORTEST_ALLOWED_GAP_DAYS));

function continues(stretch: Stretch, { day, amount }: Payment): boolean {
  if (day - stretch.lastDay > allowedGap(stretch.gap)) return false;
  return Math.abs(amount - stretch.last) <= Math.max(stretch.last * CHANGE_SHARE, SMALLEST_CHANGE);
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

function stretchesOf(payments: Payment[]): Stretch[] {
  const stretches: Stretch[] = [];
  for (const payment of payments) {
    const { day, amount } = payment;
    const current = stretches.at(-1);
    if (current && continues(current, payment)) {
      current.gap ??= day - current.lastDay;
      current.lastDay = day;
      current.last = amount;
      current.payments++;
    } else {
      stretches.push({ firstDay: day, lastDay: day, gap: null, first: amount, last: amount, payments: 1 });
    }
  }
  return withoutLonePayments(stretches);
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

function linesOfRun({ flow, from, to, currency, payments }: FlowRun, timeline: Timeline): [number, PlanLine][] {
  const stretches = stretchesOf(payments.filter(({ amount }) => amount >= SMALLEST_PAYMENT));
  let previousEnd = -Infinity;
  return stretches.flatMap((stretch, index): [number, PlanLine][] => {
    const every = intervalOf(stretch.gap);
    const end = dayAfter(stretch, every, timeline);
    // The last payment of a pension empties it and is a little different. Only a real rise is worth a range.
    const rises = Math.abs(stretch.last - stretch.first) > stretch.first * CHANGE_SHARE;
    const line = { flow, from, to, amount: stretch.first, lastAmount: rises ? stretch.last : stretch.first, every, currency };
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

export function planOf(input: SimulationInput): Plan {
  const yearsToLastAge = yearsToAge(input, LAST_AGE);
  const years = yearsToLastAge || DEFAULT_YEARS;
  const toAge = yearsToLastAge > 0 ? LAST_AGE : null;
  if (!hasStocks(input)) return { dates: [], years, toAge };

  const model = compile(input, years);
  const { stocks, timeline, charted } = model;
  const runs = new Map<string, FlowRun>();
  runPass(model, noNoise, (recorded) => {
    const flow = flowOf(recorded, stocks);
    if (!flow) return;
    const { day, from, to, amount, label } = recorded;
    const key = `${flow}|${from}|${to}|${label}`;
    let run = runs.get(key);
    if (!run) {
      const owner = stocks[from] ?? stocks[to];
      run = {
        flow,
        from: sourceOf(flow, recorded, stocks, input.boxes),
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
  for (const [day, line] of [...openings, ...[...runs.values()].flatMap((run) => linesOfRun(run, timeline))]) {
    linesByDay.set(day, [...(linesByDay.get(day) ?? []), line]);
  }

  const days = [...linesByDay.keys()].sort((a, b) => a - b);
  const { series } = runPass({ ...model, sampleDays: days }, noNoise);
  const { birthYear } = assumptionsOf(input.boxes);
  const dates = days.map((day, sample): PlanDate => {
    const lines = linesByDay.get(day)!;
    const balances = lines.every((line) => line.flow === 'opening')
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
