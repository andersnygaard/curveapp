// The written plan: what starts, changes and stops on which date, read from one pass without random shocks.
// It reads what the engine moved, so it cannot say anything else than what the simulation does. The flows it knows are
// named where the engine makes them, in rules.ts and norway.ts, and stretches.ts says where a run of payments changes.
import { OUTSIDE, runPass, type Recorded, type Stock } from '../engine/engine';
import { OTP_DEPOSIT, TAX_ON_PENSION, WEALTH_TAX, WEALTH_TAX_GAIN, WEALTH_TAX_SHORT } from '../engine/norway';
import { noNoise } from '../engine/random';
import { payoutSource, SURPLUS, TAX_ON_GAIN, UNMET } from '../engine/rules';
import type { Timeline } from '../engine/timeline';
import { ageOn } from './ages';
import { loanOn, valueOf } from './boxes/housing';
import { incomeOfLabel } from './boxes/pay';
import { compile, DEFAULT_YEARS, hasStocks, LAST_AGE, yearsToAge } from './compile';
import { assumptionsOf } from './query';
import { amountsOf, dayAfter, intervalOf, stretchesOf, type Payment, type PaymentInterval } from './stretches';
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
export type PlanInterval = PaymentInterval;

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

// Smaller payments are what is left of an account or a rounding, not something to plan for.
const SMALLEST_PAYMENT = 100;

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
    const line = { flow: 'housing', from: box.data.name, to: null, amount: value, lastAmount: value, every: 'once', currency: 'NOK' } as const;
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
      age: birthYear === null ? null : ageOn(timeline.dateOf(day), birthYear),
      lines: [...lines].sort((a, b) => FLOW_ORDER.indexOf(a.flow) - FLOW_ORDER.indexOf(b.flow)),
      balances,
    };
  });
  return { dates, years, toAge };
}
