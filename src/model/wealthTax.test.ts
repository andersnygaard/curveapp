// The wealth tax from boxes to numbers. All amounts are made-up examples.
import { describe, expect, it } from 'vitest';
import { runPass } from '../engine/engine';
import { WEALTH_TAX, WEALTH_TAX_GAIN, WEALTH_TAX_SHORT, type HomeKind } from '../engine/norway';
import { noNoise, passNoise } from '../engine/random';
import { simulate } from '../engine/simulate';
import { translations } from '../i18n';
import { compile, diagnose } from './compile';
import { defaultGraph, inputOf, wireOf } from './graph';
import { planOf, type PlanLine } from './plan';
import type { Box, SimulationInput } from './types';

const START = '2027-01-01';
// The last day is 31 December 2027, the first day the tax is paid.
const ONE_YEAR = 364 / 365.25;
const ALLOWANCE = 1_900_000;

const me = (birthYear = 1980): Box => ({ id: 'me', type: 'me', data: { birthYear } });
const wealthTax = (extra: Record<string, number> = {}, id = 'tax'): Box =>
  ({ id, type: 'wealthTax', data: { allowance: ALLOWANCE, rate: 1, highFrom: 21_500_000, highRate: 1.1, ...extra } }) as Box;
const account = (id: string, startAmount: number, extra: Record<string, unknown> = {}): Box =>
  ({
    id,
    type: 'account',
    data: { name: id, startAmount, startDate: START, currency: 'NOK', accountType: 'regular', taxRate: 0, inflation: 0, shieldRate: 0, unusedShield: 0, ...extra },
  }) as Box;
const ask = (id: string, startAmount: number, extra: Record<string, unknown> = {}) => account(id, startAmount, { accountType: 'ask', taxRate: 50, ...extra });
const home = (value: number, loan = 0, paidOff = '', kind: HomeKind = 'primary', id = 'home'): Box => ({
  id,
  type: 'housing',
  data: { name: id, kind, value, loan, paidOff },
});
const withdrawal = (id: string, startAge: number, perMonth: number): Box => ({
  id,
  type: 'withdrawal',
  data: { name: id, startAge, mode: 'amount', perMonth, percent: 4 },
});
const income = (id: string, amount: number): Box => ({
  id,
  type: 'income',
  data: { name: id, amount, interval: 'monthly', pensionBasis: 0, fromAge: null, toAge: null },
});
const market = (annualReturn: number, returnInterval: 'daily' | 'monthly' = 'monthly', standardDeviation = 0): Box => ({
  id: 'm',
  type: 'return',
  data: { name: 'm', annualReturn, returnInterval, standardDeviation },
});
const money = (source: string, target: string) => wireOf(source, target, 'money');
const growing = wireOf('m', 'a', 'influence');
const flatG: Box = { id: 'g', type: 'g', data: { g: 100_000, gGrowth: 0, standardDeviation: 0 } };

function run(boxes: Box[], years: number, wires: SimulationInput['wires'] = []) {
  const model = compile({ boxes, wires }, years);
  const pass = runPass(model, noNoise);
  const stockOf = (id: string) => model.stocks.findIndex((stock) => stock.id === id);
  const flow = (label: string, year = 0) => pass.ledger.flows.get(label)?.[year] ?? 0;
  return { model, pass, stockOf, flow, balanceOf: (id: string) => pass.closing[stockOf(id)] };
}

const summaryOf = (input: SimulationInput, years: number) => [...simulate(compile(input, years), [2])].at(-1)!.summary;

const closeTo = (value: number, expected: number, within = 0.01) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(within);

describe('the wealth tax', () => {
  it('is paid on 31 December, from what the account holds that day', () => {
    const { balanceOf, flow, pass, stockOf } = run([wealthTax(), account('a', 5_000_000)], ONE_YEAR);
    closeTo(flow(WEALTH_TAX), 31_000);
    closeTo(balanceOf('a'), 5_000_000 - 31_000);
    closeTo(pass.ledger.out[stockOf('a')], 31_000);
  });

  it('has not been paid the day before', () => {
    const { balanceOf } = run([wealthTax(), account('a', 5_000_000)], 363 / 365.25);
    expect(balanceOf('a')).toBe(5_000_000);
  });

  it('is paid every year, from what is left', () => {
    const { balanceOf, flow } = run([wealthTax(), account('a', 5_000_000)], 3);
    closeTo(flow(WEALTH_TAX, 0), 31_000);
    closeTo(flow(WEALTH_TAX, 1), (5_000_000 - 31_000 - ALLOWANCE) * 0.01);
    closeTo(balanceOf('a') + flow(WEALTH_TAX, 0) + flow(WEALTH_TAX, 1) + flow(WEALTH_TAX, 2), 5_000_000);
  });

  it('counts an ASK at 80 %, whatever the account holds', () => {
    closeTo(run([wealthTax(), ask('a', 10_000_000)], ONE_YEAR).flow(WEALTH_TAX), 61_000);
  });

  it('leaves occupational and national pension out', () => {
    const pensions: Box[] = [
      flatG,
      { id: 'o', type: 'otp', data: { name: 'o', startAmount: 10_000_000, startDate: START, lowRate: 5, highRate: 10, payoutAge: null, payoutYears: 10 } },
      { id: 'f', type: 'folketrygd', data: { name: 'f', startAmount: 10_000_000, startDate: START, payoutAge: null, divisor: null } },
    ];
    expect(run([wealthTax(), ...pensions, account('a', 1_000_000)], ONE_YEAR).flow(WEALTH_TAX)).toBe(0);
  });

  it('takes it from the accounts by size', () => {
    const { balanceOf, flow } = run([wealthTax(), account('large', 6_000_000), account('small', 2_000_000)], ONE_YEAR);
    closeTo(flow(WEALTH_TAX), 61_000);
    closeTo(balanceOf('large'), 6_000_000 - 45_750);
    closeTo(balanceOf('small'), 2_000_000 - 15_250);
  });

  it('is free of tax on gains while deposits cover it', () => {
    expect(run([wealthTax(), ask('a', 10_000_000)], ONE_YEAR).flow(WEALTH_TAX_GAIN)).toBe(0);
  });

  it('draws more when it goes beyond the deposits, so the tax is paid in full, and counts the tax on gains apart', () => {
    // A high rate, so that the tax goes through the deposits in one year.
    const { flow, pass, stockOf, balanceOf } = run([wealthTax({ allowance: 0, rate: 80 }), ask('a', 1_000_000), market(100, 'daily')], ONE_YEAR, [growing]);
    const out = pass.ledger.out[stockOf('a')];
    expect(flow(WEALTH_TAX_GAIN)).toBeGreaterThan(0);
    closeTo(flow(WEALTH_TAX_GAIN), 0.5 * (out - 1_000_000), 0.1);
    closeTo(flow(WEALTH_TAX), out - flow(WEALTH_TAX_GAIN), 0.1);
    closeTo(flow(WEALTH_TAX), (balanceOf('a') + out) * 0.8 * 0.8, 0.1);
    expect(flow(WEALTH_TAX_SHORT)).toBe(0);
  });

  it('runs after the withdrawals of the day, so it counts what is really left', () => {
    const { flow, balanceOf } = run([me(), wealthTax(), account('a', 5_000_000), withdrawal('w', 47, 100_000)], ONE_YEAR, [money('a', 'w')]);
    const beforeTax = balanceOf('a') + flow(WEALTH_TAX);
    expect(beforeTax).toBeLessThan(5_000_000);
    closeTo(flow(WEALTH_TAX), (beforeTax - ALLOWANCE) * 0.01);
  });

  it('keeps the ledger adding up', () => {
    const { pass, stockOf, balanceOf } = run([wealthTax(), ask('a', 4_000_000), account('b', 3_000_000), home(9_000_000, 1_000_000, '2040-01-01')], 20);
    for (const [id, opening] of [['a', 4_000_000], ['b', 3_000_000]] as const) {
      const stock = stockOf(id);
      closeTo(balanceOf(id), opening + pass.ledger.in[stock] - pass.ledger.out[stock] + pass.ledger.growth[stock]);
    }
  });

  it('follows the market of each pass', () => {
    const model = compile({ boxes: [wealthTax(), account('a', 5_000_000), market(4, 'monthly', 15)], wires: [growing] }, 3);
    const paid = (sign: 1 | -1) => runPass(model, passNoise(0, sign)).ledger.flows.get(WEALTH_TAX)![1];
    expect(paid(1)).not.toBe(paid(-1));
  });

  it('counts the first box only, if a file has been written by hand with two', () => {
    closeTo(run([wealthTax(), wealthTax({}, 'other'), account('a', 5_000_000)], ONE_YEAR).flow(WEALTH_TAX), 31_000);
  });

  it('takes the rates from the box', () => {
    const doubled = wealthTax({ allowance: 2 * ALLOWANCE, highFrom: 43_000_000 });
    closeTo(run([doubled, account('a', 5_000_000)], ONE_YEAR).flow(WEALTH_TAX), (5_000_000 - 3_800_000) * 0.01);
  });

  it('treats a rate below nothing as nothing', () => {
    expect(run([wealthTax({ rate: -5, allowance: -1 }), account('a', 5_000_000)], ONE_YEAR).flow(WEALTH_TAX)).toBe(0);
  });
});

describe('a home in the wealth tax', () => {
  it('counts at its share, and the loan falls evenly to the date', () => {
    // 731 days from the start to the date.
    const { flow } = run([wealthTax(), account('a', 5_000_000), home(8_000_000, 3_000_000, '2029-01-01')], 2.5);
    const first = (5_000_000 + 2_000_000 - 3_000_000 * (1 - 364 / 731) - ALLOWANCE) * 0.01;
    closeTo(flow(WEALTH_TAX, 0), first);
    const second = (5_000_000 - first + 2_000_000 - 3_000_000 * (1 - 730 / 731) - ALLOWANCE) * 0.01;
    closeTo(flow(WEALTH_TAX, 1), second);
  });

  it('keeps the whole loan without a date', () => {
    const { flow } = run([wealthTax(), account('a', 5_000_000), home(8_000_000, 3_000_000, '')], ONE_YEAR);
    closeTo(flow(WEALTH_TAX), (5_000_000 + 2_000_000 - 3_000_000 - ALLOWANCE) * 0.01);
  });

  it('owes nothing when the date has passed', () => {
    const { flow } = run([wealthTax(), account('a', 5_000_000), home(8_000_000, 3_000_000, '2020-01-01')], ONE_YEAR);
    closeTo(flow(WEALTH_TAX), (5_000_000 + 2_000_000 - ALLOWANCE) * 0.01);
  });

  it.each([
    ['primary', 2_000_000],
    ['secondary', 8_000_000],
    ['cabin', 2_400_000],
  ] as const)('counts a %s home by its kind', (kind, counted) => {
    const { flow } = run([wealthTax(), account('a', ALLOWANCE), home(8_000_000, 0, '', kind)], ONE_YEAR);
    closeTo(flow(WEALTH_TAX), counted * 0.01);
  });

  it('changes nothing without the box, so saved setups give the same as before', () => {
    const { balanceOf, flow } = run([account('a', 50_000_000), home(50_000_000, 1_000_000, '2040-01-01')], 30);
    expect(balanceOf('a')).toBe(50_000_000);
    expect(flow(WEALTH_TAX)).toBe(0);
  });
});

describe('when the accounts do not cover the wealth tax', () => {
  const large = home(20_000_000);

  it('stops at 0, counts what is missing, and leaves no debt', () => {
    const { flow, balanceOf, pass, stockOf } = run([wealthTax(), account('a', 100_000), large], 4);
    // 7 800 000 counts, so 59 000 the first year. The second year only what is left can be paid.
    closeTo(flow(WEALTH_TAX, 0), 59_000);
    closeTo(flow(WEALTH_TAX, 1), 100_000 - 59_000);
    expect(balanceOf('a')).toBe(0);
    expect(flow(WEALTH_TAX, 2)).toBe(0);
    closeTo(flow(WEALTH_TAX_SHORT, 2), 58_000);
    expect(pass.ledger.short[stockOf('a')]).toBeGreaterThan(0);
  });

  it('leaves all of it missing with a pension and no account', () => {
    const pension: Box = { id: 'f', type: 'folketrygd', data: { name: 'f', startAmount: 1_000_000, startDate: START, payoutAge: null, divisor: null } };
    const { flow } = run([flatG, pension, wealthTax(), large], ONE_YEAR);
    closeTo(flow(WEALTH_TAX_SHORT), 58_000);
    expect(flow(WEALTH_TAX)).toBe(0);
  });

  it('lowers the share where the account holds, but not the sentence about the withdrawal', () => {
    const boxes = [me(), wealthTax(), account('a', 100_000), large, income('i', 50_000), withdrawal('w', 47, 40_000)];
    const summary = summaryOf({ boxes, wires: [money('i', 'w')] }, 5);
    expect(summary.stocks[0].heldShare).toBe(0);
    expect(summary.gates[0].heldShare).toBe(1);
  });

  it('says nothing about holding when there is no home, since the tax is then a small part of the accounts', () => {
    expect(summaryOf({ boxes: [wealthTax(), account('a', 5_000_000)], wires: [] }, 5).stocks[0].heldShare).toBeNull();
  });
});

describe('the wealth tax in the withdrawal chart', () => {
  const boxes = [me(), wealthTax(), account('a', 10_000_000), withdrawal('first', 50, 10_000), withdrawal('second', 50, 5_000)];
  const { withdrawals } = summaryOf({ boxes, wires: [money('a', 'first'), money('a', 'second')] }, 8);
  const [first, second] = withdrawals;

  it('is shown from the year the first withdrawal starts, a twelfth a month', () => {
    // Born 1980, so 50 is 2030, the fourth calendar year.
    expect(first.wealthTax[2]).toBe(0);
    expect(first.wealthTax[3]).toBeGreaterThan(5_000);
    expect(first.wealthTax[3]).toBeLessThan(80_000 / 12);
  });

  it('is shown once, on the first withdrawal only', () => {
    expect(second.wealthTax.every((amount) => amount === 0)).toBe(true);
  });

  it('counts in the scale and in what the withdrawal says it has paid in tax', () => {
    expect(first.perMonthMax).toBeGreaterThanOrEqual(10_000 + first.wealthTax[3]);
    closeTo(first.taxPaid, first.wealthTax.reduce((sum, amount) => sum + amount, 0) * 12, 1);
    expect(second.taxPaid).toBe(0);
  });

  it('goes to the next withdrawal when nothing pays the first one', () => {
    const summary = summaryOf({ boxes: [withdrawal('lone', 50, 1_000), ...boxes.slice(0, 4)], wires: [money('a', 'first')] }, 8);
    expect(summary.withdrawals.map(({ id }) => id)).toEqual(['first']);
    expect(summary.withdrawals[0].wealthTax[3]).toBeGreaterThan(0);
  });

  it('adds the tax on gains to pay it to the tax layer, and keeps the row to the wealth tax itself', () => {
    const input = {
      boxes: [me(), wealthTax({ allowance: 0, rate: 30 }), ask('a', 1_000_000), market(60, 'daily'), income('i', 10_000), withdrawal('w', 47, 1_000)],
      wires: [growing, money('i', 'w'), money('w', 'a')],
    };
    const { flows } = runPass(compile(input, 3), noNoise).ledger;
    const [{ tax, wealthTax: row }] = summaryOf(input, 3).withdrawals;
    const year = flows.get(WEALTH_TAX_GAIN)!.findIndex((amount) => amount > 0);
    expect(year).toBeGreaterThanOrEqual(0);
    closeTo(row[year], flows.get(WEALTH_TAX)![year] / 12, 0.1);
    closeTo(tax[year], flows.get(WEALTH_TAX_GAIN)![year] / 12, 0.1);
  });
});

describe('the wealth tax in the plan', () => {
  const lines = (input: SimulationInput, flow: PlanLine['flow']) =>
    planOf(input)
      .dates.flatMap((date) => date.lines)
      .filter((line) => line.flow === flow);

  it('is one line for as long as it lasts, with the lowest and the highest amount, however fast it rises', () => {
    const [line, ...others] = lines({ boxes: [wealthTax(), account('a', 3_000_000), market(10)], wires: [growing] }, 'wealthTax');
    expect(others).toEqual([]);
    expect(line).toMatchObject({ change: 'starts', every: 'yearly', from: null, to: null });
    expect(line.amount).toBeGreaterThan(10_000);
    expect(line.amount).toBeLessThan(20_000);
    expect(line.lastAmount).toBeGreaterThan(10 * line.amount);
  });

  it('shows how high it went when it rises and falls again', () => {
    const input = {
      boxes: [me(1990), wealthTax(), account('a', 3_000_000), market(10), withdrawal('w', 60, 200_000)],
      wires: [growing, money('a', 'w')],
    };
    const [line] = lines(input, 'wealthTax');
    expect(line.lastAmount).toBeGreaterThan(100_000);
    expect(line.amount).toBeLessThan(20_000);
  });

  it('is one line from all the accounts together', () => {
    const [line, ...others] = lines({ boxes: [wealthTax(), account('a', 6_000_000), account('b', 4_000_000)], wires: [] }, 'wealthTax');
    expect(others).toEqual([]);
    expect(line.amount).toBeGreaterThan(50_000);
  });

  it('has no line when it never reaches the allowance', () => {
    expect(lines({ boxes: [wealthTax(), account('a', 1_000_000)], wires: [] }, 'wealthTax')).toEqual([]);
  });

  it('says that it stops when the wealth falls below the allowance', () => {
    const input = { boxes: [me(1990), wealthTax(), account('a', 3_000_000), withdrawal('w', 40, 20_000)], wires: [money('a', 'w')] };
    expect(lines(input, 'wealthTax').map(({ change }) => change)).toEqual(['starts', 'stops']);
  });

  it('has its own line for the tax on gains it takes to pay it', () => {
    const input = { boxes: [wealthTax({ allowance: 0, rate: 30 }), ask('a', 1_000_000), market(60, 'daily')], wires: [growing] };
    expect(lines(input, 'wealthTaxGain').length).toBeGreaterThan(0);
    expect(lines(input, 'tax')).toEqual([]);
  });

  it('says what is missing', () => {
    const [line] = lines({ boxes: [wealthTax(), account('a', 100_000), home(20_000_000)], wires: [] }, 'wealthTaxShort');
    expect(line).toMatchObject({ change: 'starts', every: 'yearly' });
    expect(line.amount).toBeGreaterThan(10_000);
  });

  it('leaves the plan as it was without the box', () => {
    const { dates } = planOf({ boxes: [account('a', 10_000_000), home(8_000_000)], wires: [] });
    expect(dates.flatMap((date) => date.lines).some((line) => line.flow.startsWith('wealth'))).toBe(false);
  });
});

describe('a new setup', () => {
  const graph = defaultGraph(translations.en.defaultNames);

  it('has the box, and it can be deleted', () => {
    const box = graph.boxes.find(({ type }) => type === 'wealthTax')!;
    expect(box.data).toEqual({ allowance: 1_900_000, rate: 1, highFrom: 21_500_000, highRate: 1.1 });
    expect(box.deletable).toBeUndefined();
  });

  it('pays no wealth tax in the first years, while the account is small', () => {
    expect(runPass(compile(inputOf(graph), 3), noNoise).ledger.flows.get(WEALTH_TAX)).toBeUndefined();
  });
});

describe('what warns', () => {
  const codes = (boxes: Box[]) => diagnose({ boxes, wires: [] }).map(({ boxId, code }) => `${boxId}:${code}`);

  it('warns on both when two homes are the primary home', () => {
    expect(codes([home(1, 0, '', 'primary', 'a'), home(1, 0, '', 'primary', 'b')])).toEqual(['a:twoPrimaryHomes', 'b:twoPrimaryHomes']);
  });

  it('leaves a home and a cabin alone', () => {
    expect(codes([home(1, 0, '', 'primary', 'a'), home(1, 0, '', 'cabin', 'b'), home(1, 0, '', 'secondary', 'c')])).toEqual([]);
  });
});
