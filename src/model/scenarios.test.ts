// Whole scenarios, from boxes and wires to numbers. All amounts are made-up examples.
import { describe, expect, it } from 'vitest';
import { runPass, type Model, type PassResult } from '../engine/engine';
import { noNoise, passNoise } from '../engine/random';
import { simulate } from '../engine/simulate';
import type { BudgetData } from './boxes/budget';
import type { IncomeData } from './boxes/income';
import { assumptionsOf } from './query';
import { compile, diagnose, yearsToAge } from './compile';
import { wireOf } from './graph';
import type { Box, SimulationInput, Wire } from './types';

const START = '2027-01-01';
const flatG = { id: 'g', type: 'g', data: { g: 100_000, gGrowth: 0, standardDeviation: 0 } } as const;

const me = (birthYear: number, retirementAge: number | null = null): Box => ({
  id: 'me',
  type: 'me',
  data: { birthYear, retirementAge },
});
const income = (id: string, amount: number, extra: Partial<IncomeData> = {}): Box => ({
  id,
  type: 'income',
  data: { name: id, amount, interval: 'monthly', pensionBasis: amount * 12, stopsAtRetirement: true, ...extra },
});
const transfer = (id: string, amount: number): Box => ({
  id,
  type: 'transfer',
  data: { name: id, amount, interval: 'monthly' },
});
const account = (id: string, startAmount = 0, extra: Record<string, unknown> = {}): Box =>
  ({
    id,
    type: 'account',
    data: { name: id, startAmount, startDate: START, currency: 'NOK', accountType: 'regular', taxRate: 0, inflation: 0, ...extra },
  }) as Box;
const market = (id: string, annualReturn: number, standardDeviation: number, returnInterval = 'tradingDays'): Box =>
  ({ id, type: 'return', data: { name: id, annualReturn, returnInterval, standardDeviation } }) as Box;
const otp = (id: string, extra: Record<string, unknown> = {}): Box =>
  ({
    id,
    type: 'otp',
    data: { name: id, startAmount: 0, startDate: START, lowRate: 5, highRate: 10, payoutAge: null, payoutYears: 10, ...extra },
  }) as Box;
const folketrygd = (id: string, startAmount: number, extra: Record<string, unknown> = {}): Box =>
  ({
    id,
    type: 'folketrygd',
    data: { name: id, startAmount, startDate: START, payoutAge: null, divisor: null, ...extra },
  }) as Box;
const budget = (id: string, ...amounts: number[]): Box => ({
  id,
  type: 'budget',
  data: { name: id, lines: amounts.map((amount, index) => ({ id: `${index}`, name: `line ${index}`, amount })) } satisfies BudgetData,
});
const withdrawal = (id: string, startAge: number, perMonth: number, extra: Record<string, unknown> = {}): Box =>
  ({ id, type: 'withdrawal', data: { name: id, startAge, mode: 'amount', perMonth, percent: 4, ...extra } }) as Box;

const money = (source: string, target: string): Wire => wireOf(source, target, 'money');
const basis = (source: string, target: string): Wire => wireOf(source, target, 'basis');
const influence = (source: string, target: string): Wire => wireOf(source, target, 'influence');

function run(input: SimulationInput, years: number): { model: Model; pass: PassResult; end: (id: string) => number } {
  const model = compile(input, years);
  const pass = runPass(model, noNoise);
  const end = (id: string) => {
    const stock = model.stocks.findIndex((candidate) => candidate.id === id);
    return pass.series[model.charted.indexOf(stock)].at(-1)!;
  };
  return { model, pass, end };
}

const closeTo = (value: number, expected: number, within = 1) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(within);

describe('the default scenario', () => {
  it('gives the same as before the rebuild', () => {
    const { end } = run(
      {
        boxes: [income('i', 50_000), transfer('t', 5_000), account('a', 100_000, { startDate: '2026-11-02' }), market('m', 4, 15)],
        wires: [money('i', 't'), money('t', 'a'), influence('m', 'a')],
      },
      30,
    );
    closeTo(end('a'), 3_751_061);
  });
});

describe('income is money', () => {
  it('cannot be spent twice, however large the transfers are', () => {
    const input = {
      boxes: [income('i', 1_000), transfer('t1', 30_000), transfer('t2', 30_000), account('a')],
      wires: [money('i', 't1'), money('t1', 'a'), money('i', 't2'), money('t2', 'a')],
    };
    const { end } = run(input, 1);
    expect(end('a')).toBe(1_000 * 12);
    expect(diagnose(input)).toEqual([{ boxId: 'i', code: 'transfersExceedIncome' }]);
  });

  it('can go straight to an account, and then the rest goes there', () => {
    const { end } = run(
      {
        boxes: [income('i', 10_000), transfer('t', 3_000), account('a'), account('b')],
        wires: [money('i', 'b'), money('i', 't'), money('t', 'a')],
      },
      1,
    );
    expect(end('a')).toBe(3_000 * 12);
    expect(end('b')).toBe(7_000 * 12);
  });

  it('lets several incomes end up in one account', () => {
    const { end } = run(
      { boxes: [income('i1', 1_000), income('i2', 2_000), income('i3', 3_000), account('a')], wires: [money('i1', 'a'), money('i2', 'a'), money('i3', 'a')] },
      1,
    );
    expect(end('a')).toBe(6_000 * 12);
  });
});

describe('budget', () => {
  const save = (boxes: Box[], lines: number[]) =>
    run(
      {
        boxes: [...boxes, budget('b', ...lines), account('a')],
        wires: [...boxes.map((box) => money(box.id, 'b')), money('b', 'a')],
      },
      1,
    );

  it('saves what is left after the lines', () => {
    closeTo(save([income('i', 50_000)], [20_000, 15_000]).end('a'), 15_000 * 12, 0.01);
  });

  it('takes several incomes', () => {
    closeTo(save([income('i', 50_000), income('u', 10_000)], [20_000, 15_000]).end('a'), 25_000 * 12, 0.01);
  });

  it('saves the same from a quarterly income as from the same money paid monthly', () => {
    const quarterly = save([income('i', 150_000, { interval: 'quarterly' })], [20_000, 15_000]).end('a');
    closeTo(quarterly, (50_000 - 35_000) * 12, 0.01);
  });

  it('saves nothing and warns when the budget is larger than the income', () => {
    const boxes = [income('i', 30_000), budget('b', 35_000), account('a')];
    const wires = [money('i', 'b'), money('b', 'a')];
    expect(run({ boxes, wires }, 1).end('a')).toBe(0);
    expect(diagnose({ boxes, wires })).toEqual([{ boxId: 'b', code: 'budgetExceedsIncome' }]);
  });

  it('counts only what is left after fixed transfers', () => {
    const { end } = run(
      {
        boxes: [income('i', 50_000), transfer('t', 10_000), budget('b', 30_000), account('a'), account('c')],
        wires: [money('i', 't'), money('t', 'c'), money('i', 'b'), money('b', 'a')],
      },
      1,
    );
    closeTo(end('a'), 10_000 * 12, 0.01);
    expect(end('c')).toBe(10_000 * 12);
  });

  it('lets the other income carry the budget when one stops', () => {
    const boxes = [me(1980, 49), income('i', 50_000), income('r', 40_000, { stopsAtRetirement: false }), budget('b', 30_000), account('a')];
    const wires = [money('i', 'b'), money('r', 'b'), money('b', 'a')];
    const { end } = run({ boxes, wires }, 3);
    // 2027 and 2028 with both incomes, 2029 with one.
    closeTo(end('a'), 60_000 * 24 + 10_000 * 12, 1);
  });
});

describe('OTP', () => {
  const yearly = (salary: number) => {
    const { end } = run(
      { boxes: [flatG, income('i', 30_000, { pensionBasis: salary }), otp('o')], wires: [basis('i', 'o')] },
      1,
    );
    return (end('o') / 12) * 12;
  };

  it('deposits 5 % up to 7.1 G and 10 % between 7.1 and 12 G, from the basis and not from what is paid out', () => {
    closeTo(yearly(600_000), 30_000);
    closeTo(yearly(1_000_000), 0.05 * 710_000 + 0.1 * 290_000);
    closeTo(yearly(2_000_000), 0.05 * 710_000 + 0.1 * 490_000);
  });

  it('leaves the money from the salary untouched', () => {
    const { end } = run(
      {
        boxes: [flatG, income('i', 30_000, { pensionBasis: 600_000 }), otp('o'), transfer('t', 5_000), account('a')],
        wires: [basis('i', 'o'), money('i', 't'), money('t', 'a')],
      },
      1,
    );
    expect(end('a')).toBe(5_000 * 12);
  });

  it('reads the basis of a bonus as 0 when it is 0', () => {
    closeTo(
      run(
        { boxes: [flatG, income('i', 30_000, { pensionBasis: 600_000 }), income('b', 90_000, { pensionBasis: 0, interval: 'yearly' }), otp('o')], wires: [basis('i', 'o'), basis('b', 'o')] },
        1,
      ).end('o'),
      30_000,
    );
  });
});

describe('Folketrygden', () => {
  it('earns 18.1 % of the basis up to 7.1 G, added at the end of the following year', () => {
    const { pass } = run(
      { boxes: [flatG, income('i', 30_000, { pensionBasis: 600_000 }), folketrygd('f', 1_000_000)], wires: [basis('i', 'f')] },
      5.1,
    );
    const series = pass.series[0];
    const growth = series.at(-1)! - series[0];
    closeTo(growth, 5 * 0.181 * 600_000);
  });

  it('caps the basis at 7.1 G', () => {
    const { end } = run(
      { boxes: [flatG, income('i', 30_000, { pensionBasis: 2_000_000 }), folketrygd('f', 0)], wires: [basis('i', 'f')] },
      2.1,
    );
    closeTo(end('f'), 2 * 0.181 * 710_000);
  });

  it('is regulated with the growth of G', () => {
    const grown = { id: 'g', type: 'g', data: { g: 100_000, gGrowth: 3.5, standardDeviation: 0 } } as const;
    const { end } = run({ boxes: [grown, folketrygd('f', 1_000_000)], wires: [] }, 10);
    closeTo(end('f'), 1_000_000 * 1.035 ** 10);
  });

  it('is shown after the accounts, since it is not money', () => {
    const { model } = run({ boxes: [folketrygd('f', 0), account('a'), flatG], wires: [] }, 1);
    expect(model.charted.map((stock) => model.stocks[stock].id)).toEqual(['a', 'f']);
  });

  it('stops the line at the payout age and pays the balance divided by the divisor', () => {
    const boxes = [me(1980, 50), flatG, folketrygd('f', 2_000_000, { payoutAge: 50, divisor: 20 }), account('a')];
    const wires = [money('f', 'a')];
    const { model, pass, end } = run({ boxes, wires }, 5);
    expect(Number.isNaN(end('f'))).toBe(true);
    const f = pass.series[model.charted.indexOf(model.stocks.findIndex((s) => s.id === 'f'))];
    const lastKnown = Array.from(f).filter((value) => !Number.isNaN(value)).at(-1)!;
    closeTo(lastKnown, 2_000_000);
    // 2030 and 2031 at 100 000 a year, and January 2032 is the last sample day.
    closeTo(end('a'), 100_000 * 2, 100_000 / 12 + 1);
  });

  it('uses an estimate when the divisor is empty', () => {
    const boxes = [me(1980), flatG, folketrygd('f', 1_800_000, { payoutAge: 47 }), account('a')];
    const { end } = run({ boxes, wires: [money('f', 'a')] }, 2);
    closeTo(end('a'), (1_800_000 / 38 / 12) * 24, 5_000);
  });
});

describe('retirement', () => {
  it('stops income, transfers, OTP deposits and earnings at the same age, but keeps growth', () => {
    const boxes = [me(1980, 49), flatG, income('i', 30_000, { pensionBasis: 600_000 }), transfer('t', 5_000), account('a', 0), otp('o'), folketrygd('f', 0)];
    const wires = [money('i', 't'), money('t', 'a'), basis('i', 'o'), basis('i', 'f')];
    const { end } = run({ boxes, wires }, 6);
    expect(end('a')).toBe(5_000 * 24);
    closeTo(end('o'), 30_000 * 2);
    // Two working years, and the first year end also adds the year before the start, as it always has.
    closeTo(end('f'), 3 * 0.181 * 600_000);
  });

  it('lets an income such as rent continue', () => {
    const boxes = [me(1980, 49), income('r', 10_000, { stopsAtRetirement: false }), account('a')];
    expect(run({ boxes, wires: [money('r', 'a')] }, 4).end('a')).toBe(10_000 * 48);
  });

  it('needs a birth year to know when', () => {
    const boxes = [me(0, 49), income('i', 10_000), account('a')];
    const input = { boxes, wires: [money('i', 'a')] };
    expect(run(input, 3).end('a')).toBe(10_000 * 36);
    expect(diagnose(input)).toContainEqual({ boxId: 'me', code: 'needsBirthYear' });
  });
});

describe('OTP payout', () => {
  const boxes = [me(1980), otp('o', { startAmount: 1_200_000, payoutAge: 49, payoutYears: 2 }), account('a')];

  it('empties the account exactly at the end and sends the money on', () => {
    const { end, pass, model } = run({ boxes, wires: [money('o', 'a')] }, 5);
    expect(end('o')).toBe(0);
    expect(end('a')).toBe(1_200_000);
    expect(pass.ledger.short[model.stocks.findIndex((s) => s.id === 'o')]).toBe(0);
  });

  it('follows the market, and still empties the account', () => {
    const withMarket = { boxes: [...boxes, market('m', 4, 15)], wires: [money('o', 'a'), influence('m', 'o')] };
    const model = compile(withMarket, 5);
    const pass = runPass(model, passNoise(1, 1));
    const o = model.charted.indexOf(model.stocks.findIndex((s) => s.id === 'o'));
    expect(pass.series[o].at(-1)).toBeLessThan(0.01);
    expect(pass.ledger.short[model.stocks.findIndex((s) => s.id === 'o')]).toBe(0);
  });

  it('leaves the model when nothing is wired', () => {
    const { end } = run({ boxes, wires: [] }, 5);
    expect(end('o')).toBe(0);
  });

  it('warns when it is wired on but has no age', () => {
    const input = { boxes: [me(1980), otp('o'), account('a')], wires: [money('o', 'a')] };
    expect(diagnose(input)).toEqual([{ boxId: 'o', code: 'needsPayoutAge' }]);
  });
});

describe('withdrawal', () => {
  const NEED = 10_000;

  it('draws what it needs from the account', () => {
    const { end } = run(
      { boxes: [me(1980), account('a', 1_000_000), withdrawal('w', 47, NEED)], wires: [money('a', 'w')] },
      1,
    );
    expect(end('a')).toBe(1_000_000 - 12 * NEED);
  });

  it('lets pension count first and draws only what is missing', () => {
    const boxes = [me(1980), flatG, account('a', 1_000_000), folketrygd('f', 720_000, { payoutAge: 47, divisor: 12 }), withdrawal('w', 47, NEED)];
    const { end } = run({ boxes, wires: [money('a', 'w'), money('f', 'w')] }, 1);
    // The pension pays 5 000 a month, so half of the need comes from the account.
    closeTo(end('a'), 1_000_000 - 12 * (NEED - 5_000));
  });

  it('sends the surplus back to the account, with a loop through the account', () => {
    const boxes = [me(1980), flatG, account('a', 1_000_000), folketrygd('f', 2_880_000, { payoutAge: 47, divisor: 12 }), withdrawal('w', 47, NEED)];
    const { end } = run({ boxes, wires: [money('a', 'w'), money('f', 'w'), money('w', 'a')] }, 1);
    // The pension pays 20 000 a month against a need of 10 000.
    closeTo(end('a'), 1_000_000 + 12 * 10_000);
  });

  it('draws from several accounts by size', () => {
    const { end } = run(
      { boxes: [me(1980), account('a', 750_000), account('b', 250_000), withdrawal('w', 47, 1_000)], wires: [money('a', 'w'), money('b', 'w')] },
      0.5,
    );
    const drawnA = 750_000 - end('a');
    const drawnB = 250_000 - end('b');
    closeTo(drawnA / drawnB, 3, 0.001);
  });

  it('can be set as a share of the accounts on the first day, and then stays the same', () => {
    const { end, pass } = run(
      { boxes: [me(1980), account('a', 1_200_000), withdrawal('w', 47, 0, { mode: 'percent', percent: 4 })], wires: [money('a', 'w')] },
      2,
    );
    closeTo(end('a'), 1_200_000 - 24 * 4_000);
    expect(pass.ledger.flows.get('spent:accounts')![0]).toBe(12 * 4_000);
    expect(pass.ledger.flows.get('spent:accounts')![1]).toBe(12 * 4_000);
  });

  it('waits until its start age, and pension paid before that flows on', () => {
    const boxes = [me(1980), flatG, account('a', 100_000), folketrygd('f', 1_200_000, { payoutAge: 47, divisor: 12 }), withdrawal('w', 60, NEED)];
    const { end } = run({ boxes, wires: [money('f', 'w'), money('a', 'w'), money('w', 'a')] }, 1);
    closeTo(end('a'), 100_000 + 12 * (1_200_000 / 12 / 12));
  });

  it('lands on 0 when the money runs out, and says so', () => {
    const { end, pass, model } = run(
      { boxes: [me(1980), account('a', 50_000), withdrawal('w', 47, NEED)], wires: [money('a', 'w')] },
      2,
    );
    expect(end('a')).toBe(0);
    expect(pass.ledger.short[model.stocks.findIndex((s) => s.id === 'a')]).toBeGreaterThan(0);
    expect(pass.ledger.short[model.stocks.findIndex((s) => s.id === 'w')]).toBeGreaterThan(0);
    expect(pass.ledger.flows.get('unmet')![1]).toBeGreaterThan(0);
  });

  it('warns without a birth year and does nothing', () => {
    const input = { boxes: [me(0), account('a', 100_000), withdrawal('w', 47, NEED)], wires: [money('a', 'w')] };
    expect(diagnose(input)).toContainEqual({ boxId: 'w', code: 'needsBirthYear' });
    expect(run(input, 1).end('a')).toBe(100_000);
  });
});

// A whole life with two pensions, a loop and an account that can run out.
const life: SimulationInput = {
  boxes: [
    me(1985, 60),
    { id: 'g', type: 'g', data: { g: 100_000, gGrowth: 0, standardDeviation: 1 } },
    income('salary', 45_000, { pensionBasis: 700_000 }),
    budget('budget', 25_000),
    account('fund', 500_000, { accountType: 'ask', taxRate: 37.84, inflation: 2.5 }),
    market('world', 4, 15),
    otp('otp', { startAmount: 300_000, payoutAge: 65, payoutYears: 15 }),
    folketrygd('ft', 1_000_000, { payoutAge: 65, divisor: 20 }),
    withdrawal('fire', 60, 25_000),
  ],
  wires: [
    money('salary', 'budget'),
    money('budget', 'fund'),
    influence('world', 'fund'),
    influence('world', 'otp'),
    basis('salary', 'otp'),
    basis('salary', 'ft'),
    money('fund', 'fire'),
    money('otp', 'fire'),
    money('ft', 'fire'),
    money('fire', 'fund'),
  ],
};
const lifeYears = 95 - (2027 - 1985);

describe('a whole life', () => {
  const model = compile(life, lifeYears);

  it('is free of warnings', () => {
    expect(diagnose(life)).toEqual([]);
  });

  it('adds up in every pass, whatever the market does: opening + in + growth - out = closing', () => {
    for (let pair = 0; pair < 100; pair++) {
      const { ledger, closing } = runPass(model, passNoise(pair, 1));
      model.stocks.forEach((stock, index) => {
        const expected = stock.opening + ledger.in[index] + ledger.growth[index] - ledger.out[index];
        expect(Math.abs(expected - closing[index])).toBeLessThan(0.001);
        expect(closing[index]).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('never leaves money behind in the withdrawal itself', () => {
    const { closing } = runPass(model, passNoise(7, 1));
    expect(closing[model.stocks.findIndex((stock) => stock.id === 'fire')]).toBeCloseTo(0, 6);
  });

  it('has a story: Saving first, then drawing, then surplus while two pensions overlap', () => {
    const { ledger } = runPass(model, noNoise);
    const yearOfAge = (age: number) => age - (2027 - 1985);
    const fromAccounts = ledger.flows.get('spent:accounts')!;
    const surplus = ledger.flows.get('surplus')!;
    expect(fromAccounts[yearOfAge(50)]).toBe(0);
    expect(fromAccounts[yearOfAge(62)]).toBeCloseTo(12 * 25_000, 0);
    expect(surplus[yearOfAge(70)]).toBeGreaterThan(0);
    expect(fromAccounts[yearOfAge(70)]).toBe(0);
    expect(fromAccounts[yearOfAge(85)]).toBeGreaterThan(0);
  });

  it('reports the share of passes that hold, for the account and for the withdrawal', () => {
    const frames = [...simulate(model, [200])];
    const { stocks, gates } = frames[0].summary;
    const fund = stocks.find((stock) => stock.id === 'fund')!;
    expect(fund.heldShare).toBeGreaterThan(0);
    expect(fund.heldShare).toBeLessThanOrEqual(1);
    expect(gates).toEqual([{ id: 'fire', name: 'fire', heldShare: fund.heldShare }]);
    expect(stocks.find((stock) => stock.id === 'otp')!.heldShare).toBeNull();
    expect(stocks.find((stock) => stock.id === 'ft')!.closeDay).not.toBeNull();
    expect(stocks.find((stock) => stock.id === 'ft')!.payoutPerYear).toBeGreaterThan(0);
    expect(fund.afterTax).not.toBeNull();
  });
});

describe('markets', () => {
  const twoAccounts = (wires: Wire[], boxes: Box[]): SimulationInput => ({ boxes: [account('a', 100_000), account('b', 100_000), ...boxes], wires });

  function correlation(input: SimulationInput) {
    const model = compile(input, 10);
    const pairs = Array.from({ length: 60 }, (_, pair) => runPass(model, passNoise(pair, 1)).series);
    const xs = pairs.map((pass) => Math.log(pass[0].at(-1)!));
    const ys = pairs.map((pass) => Math.log(pass[1].at(-1)!));
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const [mx, my] = [mean(xs), mean(ys)];
    const cov = xs.reduce((sum, x, index) => sum + (x - mx) * (ys[index] - my), 0);
    const spread = (values: number[], middle: number) => values.reduce((sum, value) => sum + (value - middle) ** 2, 0);
    return cov / Math.sqrt(spread(xs, mx) * spread(ys, my));
  }

  it('moves two accounts together when they share a return box', () => {
    const value = correlation(twoAccounts([influence('m', 'a'), influence('m', 'b')], [market('m', 4, 15)]));
    expect(value).toBeCloseTo(1, 6);
  });

  it('moves two accounts apart when they have a box each', () => {
    const value = correlation(twoAccounts([influence('m1', 'a'), influence('m2', 'b')], [market('m1', 4, 15), market('m2', 4, 15)]));
    expect(Math.abs(value)).toBeLessThan(0.4);
  });

  it('keeps the same market when something else changes, so a difference comes from the change', () => {
    const base = [market('m', 4, 15), account('a', 100_000)];
    const wires = [influence('m', 'a')];
    const before = runPass(compile({ boxes: base, wires }, 10), passNoise(3, 1)).series[0].at(-1);
    const withOther = {
      boxes: [...base, market('other', 2, 30), account('b', 5)],
      wires: [...wires, influence('other', 'b')],
    };
    const after = runPass(compile(withOther, 10), passNoise(3, 1)).series[0].at(-1);
    expect(after).toBe(before);
  });
});

describe('the simulation as a whole', () => {
  const input = life;
  const model = compile(input, lifeYears);

  it('gives the same numbers every time', () => {
    const first = [...simulate(model, [40])][0].summary.stocks[0].median;
    const again = [...simulate(compile(input, lifeYears), [40])][0].summary.stocks[0].median;
    expect(Array.from(first)).toEqual(Array.from(again));
  });

  it('reports in stages, and each stage sees more passes', () => {
    const frames = [...simulate(model, [20, 60])];
    expect(frames.map((frame) => frame.summary.passes)).toEqual([20, 60]);
    expect(frames[1].summary.stocks[0].yMax).toBe(frames[0].summary.stocks[0].yMax);
  });

  it('leaves half the passes on each side of the thick line', () => {
    const results = Array.from({ length: 50 }, (_, pair) => [passNoise(pair, 1), passNoise(pair, -1)]).flat().map((noise) => runPass(model, noise));
    const frame = [...simulate(model, [100])][0];
    const fund = frame.summary.stocks.findIndex((stock) => stock.id === 'fund');
    const { median } = frame.summary.stocks[fund];
    const sample = model.sampleDays.length - 200;
    const above = results.filter((result) => result.series[fund][sample] > median[sample]).length;
    expect(above).toBe(50);
  });

  it('needs only two passes when nothing is random', () => {
    const fixed = compile({ boxes: [account('a', 100), market('m', 4, 0)], wires: [influence('m', 'a')] }, 5);
    const frames = [...simulate(fixed)];
    expect(frames.length).toBe(1);
    expect(frames[0].summary.passes).toBe(2);
    const last = runPass(fixed, noNoise).series[0].at(-1)!;
    expect(frames[0].summary.stocks[0].lastValue).toBeCloseTo(last, 6);
  });

  it('knows how long it takes to reach an age', () => {
    expect(yearsToAge(input, 95)).toBe(lifeYears);
    expect(yearsToAge({ boxes: [me(0), account('a')], wires: [] }, 95)).toBe(0);
    expect(assumptionsOf(input.boxes).retirementAge).toBe(60);
  });
});

describe('ASK', () => {
  it('taxes only what exceeds the deposits, and the deposits lose value with inflation', () => {
    const boxes = [account('a', 1_000_000, { accountType: 'ask', taxRate: 37.84, inflation: 2.5 }), market('m', 8, 0, 'yearly')];
    const model = compile({ boxes, wires: [influence('m', 'a')] }, 10);
    const { summary } = [...simulate(model)][0];
    closeTo(summary.stocks[0].lastValue, 2_159_152, 40);
    const deposits = 1_000_000 * 1.025 ** -(3653 / 365.25);
    const value = summary.stocks[0].lastValue;
    closeTo(summary.stocks[0].afterTax!, value - 0.3784 * (value - deposits), 2);
  });

  it('gives no tax without a gain', () => {
    const boxes = [account('a', 1_000_000, { accountType: 'ask', taxRate: 37.84, inflation: 0 })];
    const { summary } = [...simulate(compile({ boxes, wires: [] }, 5))][0];
    expect(summary.stocks[0].afterTax).toBe(1_000_000);
  });
});
