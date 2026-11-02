// The written plan, from boxes and wires to dates and amounts. All amounts are made-up examples.
import { describe, expect, it } from 'vitest';
import { runPass } from '../engine/engine';
import { noNoise } from '../engine/random';
import { compile, DEFAULT_YEARS, LAST_AGE } from './compile';
import { wireOf } from './graph';
import { planOf, type PlanChange, type PlanDate, type PlanFlow, type PlanLine } from './plan';
import type { Box, SimulationInput, Wire } from './types';

const START = '2027-01-01';
const BIRTH_YEAR = 1990;

const me = (retirementAge: number | null = 60, birthYear = BIRTH_YEAR): Box => ({ id: 'me', type: 'me', data: { birthYear, retirementAge } });
const g = (gGrowth = 0): Box => ({ id: 'g', type: 'g', data: { g: 100_000, gGrowth, standardDeviation: 0 } });
const income = (amount = 30_000, interval = 'monthly', pensionBasis = 360_000): Box =>
  ({ id: 'i', type: 'income', data: { name: 'Pay', amount, interval, pensionBasis, stopsAtRetirement: true } }) as Box;
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

  it('gives a yearly income one line, whatever falls between the payments', () => {
    const { dates } = planOf({ boxes: [me(), income(60_000, 'yearly', 0), account()], wires: [money('i', 'a')] });
    const lines = dates.flatMap((date) => date.lines).filter((line) => line.flow === 'deposit');
    expect(lines.map((line) => line.change)).toEqual(['starts', 'stops']);
    expect(lines[0].every).toBe('yearly');
  });

  it('says when an account runs out, without a date for the last small amount', () => {
    const { dates } = planOf({
      boxes: [me(40), account(100_000), gate(40, 10_000)],
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
