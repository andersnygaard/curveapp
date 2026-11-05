// The written plan, from boxes and wires to dates and amounts. All amounts are made-up examples.
import { describe, expect, it } from 'vitest';
import { taxOnPension } from '../engine/norway';
import { runPass } from '../engine/engine';
import { noNoise } from '../engine/random';
import { compile, DEFAULT_YEARS, LAST_AGE } from './compile';
import { wireOf } from './graph';
import { planOf, type PlanChange, type PlanDate, type PlanFlow, type PlanLine } from './plan';
import type { Box, SimulationInput, Wire } from './types';

const START = '2027-01-01';
const BIRTH_YEAR = 1990;

const me = (birthYear = BIRTH_YEAR): Box => ({ id: 'me', type: 'me', data: { birthYear } });
const g = (gGrowth = 0): Box => ({ id: 'g', type: 'g', data: { g: 100_000, gGrowth, standardDeviation: 0 } });
const income = (amount = 30_000, interval = 'monthly', pensionBasis = 360_000, toAge: number | null = 60): Box =>
  ({ id: 'i', type: 'income', data: { name: 'Pay', amount, interval, pensionBasis, fromAge: null, toAge } }) as Box;
const transfer = (amount = 5_000): Box => ({ id: 't', type: 'transfer', data: { name: 'Saving', amount, interval: 'monthly' } });
const account = (startAmount = 100_000): Box => ({
  id: 'a',
  type: 'account',
  data: { name: 'Fund', startAmount, startDate: START, currency: 'NOK', accountType: 'regular', taxRate: 0, inflation: 0, shieldRate: 0, unusedShield: 0 },
});
const otp = (startAmount = 0, payoutAge = 67, payoutYears = 10): Box => ({
  id: 'o',
  type: 'otp',
  data: { name: 'Occupational', startAmount, startDate: START, lowRate: 5, highRate: 10, payoutAge, payoutYears },
});
const folketrygd = (startAmount = 0, payoutAge = 67): Box => ({
  id: 'f',
  type: 'folketrygd',
  data: { name: 'National', startAmount, startDate: START, payoutAge, divisor: 20 },
});
const gate = (startAge = 60, perMonth = 20_000): Box => ({
  id: 'w',
  type: 'withdrawal',
  data: { name: 'Living', startAge, mode: 'amount', perMonth, percent: 4 },
});

const money = (source: string, target: string): Wire => wireOf(source, target, 'money');
const basis = (source: string, target: string): Wire => wireOf(source, target, 'basis');

const saving = [money('i', 't'), money('t', 'a')];
const allIntoGate = [money('a', 'w'), money('o', 'w'), money('f', 'w'), money('w', 'a'), basis('i', 'o'), basis('i', 'f')];

const atAge = (dates: PlanDate[], age: number) => dates.find((date) => date.age === age)!;
const lineIn = (date: PlanDate, flow: PlanFlow, change: PlanChange, from?: string): PlanLine | undefined =>
  date.lines.find((line) => line.flow === flow && line.change === change && (from === undefined || line.from === from));

describe('the plan of a working life and a retirement', () => {
  const input: SimulationInput = {
    boxes: [me(), g(), income(), transfer(), account(500_000), otp(1_000_000), folketrygd(1_000_000), gate()],
    wires: [...saving, ...allIntoGate],
  };
  const plan = planOf(input);

  it('runs to the last age, and its dates are in order', () => {
    expect(plan.toAge).toBe(LAST_AGE);
    const days = plan.dates.map((date) => date.day);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(new Set(days).size).toBe(days.length);
  });

  it('starts with what is already there', () => {
    const first = plan.dates[0];
    expect(new Date(first.dateMs).toISOString().slice(0, 10)).toBe(START);
    expect(lineIn(first, 'opening', 'starts')).toMatchObject({ to: 'Fund', amount: 500_000 });
    expect(lineIn(first, 'deposit', 'starts')).toMatchObject({ from: 'Pay', to: 'Fund', amount: 5_000, every: 'monthly' });
  });

  it('stops saving and starts withdrawing on the day work ends', () => {
    const date = atAge(plan.dates, 60);
    expect(new Date(date.dateMs).toISOString().slice(0, 10)).toBe('2050-01-01');
    expect(lineIn(date, 'deposit', 'stops')).toMatchObject({ from: 'Pay', to: 'Fund' });
    expect(lineIn(date, 'pensionDeposit', 'stops')).toMatchObject({ to: 'Occupational' });
    expect(lineIn(date, 'withdrawal', 'starts')).toMatchObject({ from: 'Fund', amount: 20_000, every: 'monthly' });
  });

  it('says what each pension pays, and that the surplus goes to the account', () => {
    const date = atAge(plan.dates, 67);
    const national = lineIn(date, 'pension', 'starts', 'National')!;
    const occupational = lineIn(date, 'pension', 'starts', 'Occupational')!;
    expect(national.to).toBe('Living');
    expect(occupational.lastAmount).toBe(occupational.amount);
    const pension = national.amount + occupational.amount;
    expect(pension).toBeGreaterThan(20_000);
    expect(lineIn(date, 'withdrawal', 'stops')).toBeDefined();
    const surplus = lineIn(date, 'surplus', 'starts')!;
    expect(surplus.to).toBe('Fund');
    expect(surplus.amount).toBeCloseTo(pension - 20_000, 0);
  });

  it('goes back to the account when the occupational pension is paid out', () => {
    const date = atAge(plan.dates, 77);
    expect(lineIn(date, 'pension', 'stops', 'Occupational')).toBeDefined();
    expect(lineIn(date, 'surplus', 'stops')).toBeDefined();
    const national = lineIn(atAge(plan.dates, 67), 'pension', 'starts', 'National')!;
    expect(lineIn(date, 'withdrawal', 'starts')!.amount).toBeCloseTo(20_000 - national.amount, 0);
  });

  it('shows what the accounts hold that morning, the same as the engine', () => {
    const date = atAge(plan.dates, 60);
    const model = compile(input, plan.years);
    const { series } = runPass({ ...model, sampleDays: [date.day] }, noNoise);
    const chart = model.charted.findIndex((stock) => model.stocks[stock].id === 'a');
    expect(date.balances.find((balance) => balance.name === 'Fund')!.amount).toBe(series[chart][0]);
  });

  it('leaves calculated balances out of what the accounts hold', () => {
    for (const date of plan.dates) expect(date.balances.map((balance) => balance.name)).not.toContain('National');
  });
});

describe('what the plan makes of the amounts', () => {
  it('keeps a pension payment that follows G as one line', () => {
    const { dates } = planOf({
      boxes: [me(), g(3), income(), otp(0, 99), account()],
      wires: [basis('i', 'o')],
    });
    const starts = dates.flatMap((date) => date.lines).filter((line) => line.flow === 'pensionDeposit' && line.change !== 'stops');
    expect(starts).toHaveLength(1);
    expect(starts[0].lastAmount).toBeGreaterThan(starts[0].amount * 1.5);
  });

  it('still says that a withdrawal stops when a pension takes over for good', () => {
    const { dates } = planOf({ boxes: [me(), g(), account(50_000_000), folketrygd(9_600_000, 50), gate(40, 10_000)], wires: [money('a', 'w'), money('f', 'w')] });
    const lines = dates.flatMap((date) => date.lines).filter((line) => line.flow === 'withdrawal');
    expect(lines.map((line) => line.change)).toEqual(['starts', 'stops']);
  });

  it('gives a yearly income one line, whatever falls between the payments', () => {
    const { dates } = planOf({ boxes: [me(), income(60_000, 'yearly', 0), account()], wires: [money('i', 'a')] });
    const lines = dates.flatMap((date) => date.lines).filter((line) => line.flow === 'deposit');
    expect(lines.map((line) => line.change)).toEqual(['starts', 'stops']);
    expect(lines[0].every).toBe('yearly');
  });

  it('says when an account runs out, without a date for the last small amount', () => {
    const { dates } = planOf({
      boxes: [me(), account(100_000), gate(40, 10_000)],
      wires: [money('a', 'w')],
    });
    const short = dates.find((date) => lineIn(date, 'unmet', 'starts'))!;
    expect(lineIn(short, 'unmet', 'starts')).toMatchObject({ from: 'Living', amount: 10_000 });
    expect(lineIn(short, 'withdrawal', 'stops')).toBeDefined();
    expect(dates.flatMap((date) => date.lines).filter((line) => line.flow === 'withdrawal')).toHaveLength(2);
  });

  it('shows a pension that nothing needs yet as spent', () => {
    const { dates } = planOf({ boxes: [me(), g(), account(), folketrygd(1_000_000, 67), gate(74)], wires: [money('f', 'w'), money('a', 'w')] });
    const date = atAge(dates, 67);
    expect(lineIn(date, 'surplus', 'starts')).toMatchObject({ to: null });
    expect(lineIn(atAge(dates, 74), 'surplus', 'stops')).toBeDefined();
  });
});

describe('an income wired straight to a withdrawal in the plan', () => {
  const job = (amount: number, interval = 'monthly', toAge: number | null = 60) => income(amount, interval, 0, toAge);
  const wired = [money('i', 'w'), money('a', 'w'), money('w', 'a')];

  it('says that it goes to the withdrawal, and that what is left over goes on', () => {
    const { dates } = planOf({ boxes: [me(), job(30_000), account(500_000), gate(50, 20_000)], wires: wired });
    expect(lineIn(dates[0], 'deposit', 'starts', 'Pay')).toMatchObject({ to: 'Living', amount: 30_000, every: 'monthly' });
    expect(lineIn(dates[0], 'surplus', 'starts')).toMatchObject({ from: 'Living', to: 'Fund', amount: 30_000 });
    expect(lineIn(atAge(dates, 50), 'surplus', 'changes')).toMatchObject({ to: 'Fund', amount: 10_000 });
  });

  it('says when the accounts take over from it', () => {
    const { dates } = planOf({ boxes: [me(), job(30_000), account(5_000_000), gate(50, 20_000)], wires: wired });
    const date = atAge(dates, 60);
    expect(lineIn(date, 'deposit', 'stops', 'Pay')).toMatchObject({ to: 'Living' });
    expect(lineIn(date, 'surplus', 'stops')).toBeDefined();
    expect(lineIn(date, 'withdrawal', 'starts')).toMatchObject({ from: 'Fund', amount: 20_000, every: 'monthly' });
  });

  it('has no tax line, since it is already after tax', () => {
    const { dates } = planOf({ boxes: [me(), job(30_000), account(500_000), gate(50, 20_000)], wires: wired });
    expect(dates.flatMap((date) => date.lines).some((line) => line.flow === 'tax')).toBe(false);
  });

  it('does not start and stop the withdrawal every year around a yearly income', () => {
    const { dates } = planOf({ boxes: [me(), job(100_000, 'yearly', null), account(50_000_000), gate(40, 10_000)], wires: wired });
    const lines = dates.flatMap((date) => date.lines).filter((line) => line.flow === 'withdrawal');
    expect(lines.filter((line) => line.change === 'starts')).toHaveLength(1);
    expect(lines.filter((line) => line.change === 'stops').length).toBeLessThanOrEqual(1);
  });

  it('does not change the withdrawal every year when a yearly income covers a part of that month', () => {
    const { dates } = planOf({ boxes: [me(), job(4_000, 'yearly', null), account(50_000_000), gate(40, 10_000)], wires: [money('i', 'w'), money('a', 'w')] });
    const lines = dates.flatMap((date) => date.lines).filter((line) => line.flow === 'withdrawal');
    expect(lines.filter((line) => line.change !== 'stops')).toHaveLength(1);
    expect(lines[0]).toMatchObject({ change: 'starts', amount: 10_000, every: 'monthly' });
  });

  it('keeps a weekly income on few lines, although some months have five pay days', () => {
    const { dates } = planOf({ boxes: [me(), job(1_500, 'weekly', null), account(50_000_000), gate(40, 4_000)], wires: wired });
    const lines = dates.flatMap((date) => date.lines).filter((line) => line.flow === 'surplus');
    expect(lines.filter((line) => line.change === 'changes').length).toBeLessThanOrEqual(1);
    expect(dates.length).toBeLessThan(10);
  });
});

describe('the tax in the plan', () => {
  it('has no tax line for a pension too small to be taxed', () => {
    const { dates } = planOf({ boxes: [me(), g(), account(), folketrygd(1_200_000, 67), gate(67, 2_000)], wires: [money('f', 'w'), money('w', 'a')] });
    expect(lineIn(atAge(dates, 67), 'tax', 'starts')).toBeUndefined();
  });

  it('has a line of its own for tax on pension, and says what the pension covers after it', () => {
    const living = { id: 'w', type: 'withdrawal', data: { name: 'Living', startAge: 67, mode: 'amount', perMonth: 2_000, percent: 4 } } as Box;
    const { dates } = planOf({ boxes: [me(), g(), account(), folketrygd(12_000_000, 67), living], wires: [money('f', 'w'), money('w', 'a')] });
    const date = atAge(dates, 67);
    const pension = lineIn(date, 'pension', 'starts', 'National')!;
    const tax = taxOnPension(pension.amount * 12, true) / 12;
    expect(tax).toBeGreaterThan(0);
    expect(lineIn(date, 'tax', 'starts', 'Living')!.amount).toBeCloseTo(tax, 0);
    expect(lineIn(date, 'surplus', 'starts')!.amount).toBeCloseTo(pension.amount - tax - 2_000, 0);
  });

  it('has no tax line when nothing is taxed', () => {
    const { dates } = planOf({ boxes: [me(), account(1_000_000), gate(40, 10_000)], wires: [money('a', 'w')] });
    expect(dates.flatMap((date) => date.lines).some((line) => line.flow === 'tax')).toBe(false);
  });

  it('says what a withdrawal leaves and what it costs in tax, once the deposits are used up', () => {
    const ask: Box = {
      id: 'a',
      type: 'account',
      data: { name: 'Fund', startAmount: 100_000, startDate: START, currency: 'NOK', accountType: 'ask', taxRate: 50, inflation: 0, shieldRate: 0, unusedShield: 0 },
    };
    const market: Box = { id: 'm', type: 'return', data: { name: 'Market', annualReturn: 100, returnInterval: 'yearly', standardDeviation: 0 } };
    const { dates } = planOf({ boxes: [me(), ask, market, gate(40, 200_000)], wires: [money('a', 'w'), wireOf('m', 'a', 'influence')] });
    const lines = dates.flatMap((date) => date.lines);
    expect(lines.find((line) => line.flow === 'withdrawal')?.from).toBe('Fund');
    expect(lines.find((line) => line.flow === 'tax')?.from).toBe('Fund');
  });
});

describe('a transfer between two accounts in the plan', () => {
  const savings: Box = {
    id: 'b',
    type: 'account',
    data: { name: 'Savings', startAmount: 0, startDate: START, currency: 'NOK', accountType: 'regular', taxRate: 0, inflation: 0, shieldRate: 0, unusedShield: 0 },
  };
  const named = (name: string, id = 't'): Box => ({ id, type: 'transfer', data: { name, amount: 1_000, interval: 'monthly' } });
  const linesOf = (transfers: Box[]) =>
    planOf({
      boxes: [me(), account(), savings, ...transfers],
      wires: transfers.flatMap((transfer) => [money('a', transfer.id), money(transfer.id, 'b')]),
    }).dates.flatMap((date) => date.lines);

  it.each(['tax: car', 'wealth:tax'])('a transfer named like a tax is still a move, here %s', (name) => {
    const lines = linesOf([named(name)]);
    expect([...new Set(lines.map(({ flow }) => flow))]).toEqual(['opening', 'move']);
    expect(lines.find((line) => line.flow === 'move')).toMatchObject({ change: 'starts', from: 'Fund', to: 'Savings', amount: 1_000 });
  });

  it('gives two transfers with the same name a line each', () => {
    const starts = linesOf([named('Saving'), named('Saving', 'u')]).filter((line) => line.flow === 'move' && line.change === 'starts');
    expect(starts.map(({ amount }) => amount)).toEqual([1_000, 1_000]);
  });
});

describe('housing in the plan', () => {
  const home = (loan = 1_000_000, paidOff = '2040-06-01', value = 3_000_000, id = 'h', name = 'Home'): Box => ({
    id,
    type: 'housing',
    data: { name, kind: 'primary', value, loan, paidOff },
  });
  const housingLines = (dates: PlanDate[]) => dates.flatMap((date) => date.lines).filter((line) => line.flow === 'housing');
  const dateOf = ({ dateMs }: PlanDate) => new Date(dateMs).toISOString().slice(0, 10);

  it('says what it is worth and owes on the first date, and when the loan is paid off', () => {
    const { dates } = planOf({ boxes: [me(), account(), home()], wires: [] });
    expect(dateOf(dates[0])).toBe(START);
    expect(lineIn(dates[0], 'housing', 'starts')).toMatchObject({ from: 'Home', to: null, amount: 3_000_000, loan: 1_000_000, every: 'once' });
    const paidOff = dates.find((date) => lineIn(date, 'housing', 'stops'))!;
    expect(dateOf(paidOff)).toBe('2040-06-01');
    expect(paidOff.age).toBe(50);
    expect(lineIn(paidOff, 'housing', 'stops')).toMatchObject({ from: 'Home' });
  });

  it('keeps one set of lines for each box, so a home and a cabin are apart', () => {
    const cabin = home(200_000, '2030-01-01', 800_000, 'c', 'Cabin');
    const { dates } = planOf({ boxes: [me(), account(), home(), cabin], wires: [] });
    expect(lineIn(dates[0], 'housing', 'starts', 'Home')).toMatchObject({ amount: 3_000_000 });
    expect(lineIn(dates[0], 'housing', 'starts', 'Cabin')).toMatchObject({ amount: 800_000, loan: 200_000 });
    expect(dateOf(dates.find((date) => lineIn(date, 'housing', 'stops', 'Cabin'))!)).toBe('2030-01-01');
    expect(dateOf(dates.find((date) => lineIn(date, 'housing', 'stops', 'Home'))!)).toBe('2040-06-01');
  });

  it.each([
    ['no loan', 0, '2040-06-01'],
    ['a date after the plan ends', 1_000_000, '2200-01-01'],
    ['no date', 1_000_000, ''],
  ])('has no line about paying off with %s', (_, loan, paidOff) => {
    const { dates } = planOf({ boxes: [me(), account(), home(loan, paidOff)], wires: [] });
    expect(housingLines(dates).map((line) => line.change)).toEqual(['starts']);
    expect(lineIn(dates[0], 'housing', 'starts')!.loan).toBe(loan);
  });

  it('owes nothing when the date has already passed', () => {
    const { dates } = planOf({ boxes: [me(), account(), home(1_000_000, '2020-01-01')], wires: [] });
    expect(housingLines(dates).map((line) => line.change)).toEqual(['starts']);
    expect(lineIn(dates[0], 'housing', 'starts')!.loan).toBe(0);
  });

  it('has no line for a box with nothing in it', () => {
    const { dates } = planOf({ boxes: [me(), account(), home(0, '', 0)], wires: [] });
    expect(housingLines(dates)).toEqual([]);
  });

  it('is left out of what the accounts hold', () => {
    const { dates } = planOf({ boxes: [me(), income(), transfer(), account(), home()], wires: saving });
    const paidOff = dates.find((date) => lineIn(date, 'housing', 'stops'))!;
    expect(paidOff.balances.map((balance) => balance.name)).toEqual(['Fund']);
    for (const date of dates) expect(date.balances.map((balance) => balance.name)).not.toContain('Home');
  });

  it('adds no balances to the first date, where they would only repeat the opening', () => {
    expect(planOf({ boxes: [me(), account(), home()], wires: [] }).dates[0].balances).toEqual([]);
  });

  it('changes nothing else in the plan or the simulation', () => {
    const boxes = [me(), g(), income(), transfer(), account(500_000), otp(1_000_000), folketrygd(1_000_000), gate()];
    const wires = [...saving, ...allIntoGate];
    const withHome = { boxes: [...boxes, home()], wires };
    const others = (input: SimulationInput) =>
      planOf(input).dates.flatMap((date) => date.lines.filter((line) => line.flow !== 'housing'));
    expect(others(withHome)).toEqual(others({ boxes, wires }));
    const closing = (input: SimulationInput) => runPass(compile(input, 40), noNoise).closing;
    expect(closing(withHome)).toEqual(closing({ boxes, wires }));
  });

  it('starts no plan by itself, since nothing then holds money', () => {
    expect(planOf({ boxes: [me(), home()], wires: [] }).dates).toEqual([]);
  });
});

describe('a plan without everything filled in', () => {
  it('has no dates without anything that holds value', () => {
    expect(planOf({ boxes: [me(), income()], wires: [] }).dates).toEqual([]);
  });

  it('runs for the default period without a birth year, and has no ages', () => {
    const plan = planOf({ boxes: [account()], wires: [] });
    expect(plan.toAge).toBeNull();
    expect(plan.years).toBe(DEFAULT_YEARS);
    expect(plan.dates[0].age).toBeNull();
    expect(plan.dates[0].balances).toEqual([]);
  });

  it('leaves out an account with nothing in it until something happens', () => {
    expect(planOf({ boxes: [account(0)], wires: [] }).dates).toEqual([]);
  });
});
