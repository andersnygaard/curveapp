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
    data: { name: id, startAmount, startDate: START, currency: 'NOK', accountType: 'regular', taxRate: 0, inflation: 0, shieldRate: 0, unusedShield: 0, ...extra },
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
  ({ id, type: 'withdrawal', data: { name: id, startAge, mode: 'amount', perMonth, percent: 4, pensionTax: 0, ...extra } }) as Box;

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

  it('works as a ceiling over two pensions: the surplus saves up, and it draws on the savings when one pension ends', () => {
    const boxes = [
      me(1980),
      flatG,
      account('fund', 0),
      otp('o', { startAmount: 43_000 * 120, payoutAge: 47, payoutYears: 10 }),
      folketrygd('f', 20_000 * 12 * 20, { payoutAge: 47, divisor: 20 }),
      withdrawal('w', 47, 40_000),
    ];
    const wires = [money('o', 'w'), money('f', 'w'), money('fund', 'w'), money('w', 'fund')];
    const { end, pass } = run({ boxes, wires }, 12);
    const spentFromPension = pass.ledger.flows.get('spent:pension')!;
    const spentFromAccounts = pass.ledger.flows.get('spent:accounts')!;
    // Ten years with 63 000 against a need of 40 000.
    expect(spentFromPension[0]).toBeCloseTo(40_000 * 12, 2);
    expect(pass.ledger.flows.get('surplus')![0]).toBeCloseTo(23_000 * 12, 2);
    expect(spentFromAccounts[0]).toBe(0);
    // Then one pension of 20 000, and the rest of the 40 000 from the savings.
    expect(spentFromPension[10]).toBeCloseTo(20_000 * 12, 2);
    expect(spentFromAccounts[10]).toBeCloseTo(20_000 * 12, 2);
    closeTo(end('fund'), 23_000 * 120 - 20_000 * 24, 0.01);
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

describe('ages given to the month', () => {
  it('stops income in the middle of a year', () => {
    const { end } = run({ boxes: [me(1980, 49.5), income('i', 10_000), account('a')], wires: [money('i', 'a')] }, 5);
    // January 2027 to June 2029.
    expect(end('a')).toBe(30 * 10_000);
  });

  it('keeps OTP and Folketrygden whole when work stops in the middle of a year', () => {
    const { end } = run(
      { boxes: [me(1980, 49.5), flatG, income('i', 30_000, { pensionBasis: 600_000 }), otp('o'), folketrygd('f', 0)], wires: [basis('i', 'o'), basis('i', 'f')] },
      5,
    );
    closeTo(end('o'), 30 * (30_000 / 12), 1);
    expect(end('f')).toBeGreaterThan(0);
  });

  it('starts a withdrawal in the middle of a year', () => {
    const { end } = run({ boxes: [me(1980), account('a', 100_000), withdrawal('w', 47.5, 1_000)], wires: [money('a', 'w')] }, 1);
    // July to December 2027.
    expect(end('a')).toBe(100_000 - 6 * 1_000);
  });

  it('starts a payout in the middle of a year', () => {
    const { end } = run({ boxes: [me(1980), otp('o', { startAmount: 120_000, payoutAge: 47.5, payoutYears: 1 }), account('a')], wires: [money('o', 'a')] }, 1);
    expect(end('a')).toBe(6 * 10_000);
  });
});

describe('the amount paid out a year', () => {
  const summaryOf = (input: SimulationInput, years: number) => [...simulate(compile(input, years), [2])][0].summary.stocks;

  it('is right for a payout that is over within a year', () => {
    const stocks = summaryOf({ boxes: [me(1980), otp('o', { startAmount: 1_200_000, payoutAge: 47, payoutYears: 1 })], wires: [] }, 3);
    closeTo(stocks[0].payoutPerYear!, 1_200_000, 0.01);
  });

  it('is right however the calendar years and the end of the period fall', () => {
    const boxes = [me(1980), flatG, folketrygd('f', 2_400_000, { payoutAge: 51, divisor: 20, startDate: '2026-11-02' })];
    closeTo(summaryOf({ boxes, wires: [] }, 5)[0].payoutPerYear!, 120_000, 0.01);
  });

  it('is left out when the payout lies beyond the period', () => {
    const boxes = [me(1980), otp('o', { startAmount: 100, payoutAge: 90, payoutYears: 1 })];
    expect(summaryOf({ boxes, wires: [] }, 3)[0].payoutPerYear).toBeNull();
  });
});

describe('the order of the boxes on the canvas', () => {
  const boxes = [income('i', 10_000), account('a'), transfer('t', 5_000), account('b')];
  const wires = [money('i', 'a'), money('a', 't'), money('t', 'b')];
  const outcome = (order: Box[]) => {
    const model = compile({ boxes: order, wires }, 2);
    const { summary } = [...simulate(model)][0];
    const stockB = summary.stocks.find((stock) => stock.id === 'b')!;
    return { held: summary.stocks.find((stock) => stock.id === 'a')!.heldShare, b: stockB.lastValue };
  };

  it('does not change the result: income arrives before anything is drawn', () => {
    expect(outcome(boxes)).toEqual({ held: 1, b: 120_000 });
    expect(outcome([...boxes].reverse())).toEqual({ held: 1, b: 120_000 });
  });

  it('does not change a chain of accounts', () => {
    const chain = [income('i', 10_000), account('a'), transfer('t1', 5_000), account('b'), transfer('t2', 2_000), account('c')];
    const chainWires = [money('i', 'a'), money('a', 't1'), money('t1', 'b'), money('b', 't2'), money('t2', 'c')];
    const result = (order: Box[]) => {
      const { summary } = [...simulate(compile({ boxes: order, wires: chainWires }, 1))][0];
      return summary.stocks.map((stock) => [stock.id, stock.lastValue, stock.heldShare]).sort();
    };
    expect(result([...chain].reverse())).toEqual(result(chain));
    expect(result(chain).find(([id]) => id === 'b')![2]).toBe(1);
  });

  it('lets a withdrawal see this month\'s surplus from another withdrawal', () => {
    const list = [me(1980), flatG, account('fund'), folketrygd('f', 480_000, { payoutAge: 47, divisor: 20 }), withdrawal('first', 47, 1_000), withdrawal('second', 47, 500)];
    const links = [money('f', 'first'), money('first', 'fund'), money('fund', 'second')];
    const held = (order: Box[]) => [...simulate(compile({ boxes: order, wires: links }, 1))][0].summary.gates.map((gate) => gate.heldShare);
    expect(held(list)).toEqual([1, 1]);
    expect(held([...list].reverse())).toEqual([1, 1]);
  });
});

describe('a pension that starts before the simulation', () => {
  it('pays from when the balance exists, and does not lock at 0', () => {
    const boxes = [me(1960), flatG, account('a', 0, { startDate: '2026-01-15' }), folketrygd('f', 2_000_000, { payoutAge: 66, divisor: 20, startDate: '2026-11-02' })];
    const { pass } = run({ boxes, wires: [money('f', 'a')] }, 2);
    expect(pass.ledger.flows.get('payout:f')![1]).toBeCloseTo(100_000, 6);
  });

  it('shows the balance it has, and not 0', () => {
    const boxes = [me(1955), flatG, folketrygd('f', 2_000_000, { payoutAge: 67, divisor: 20 })];
    const { summary } = [...simulate(compile({ boxes, wires: [] }, 3))][0];
    expect(summary.stocks[0].lastValue).toBe(2_000_000);
    closeTo(summary.stocks[0].payoutPerYear!, 100_000, 0.01);
  });

  it('counts OTP from the age it began, so only the rest of the term remains', () => {
    const boxes = [me(1955), otp('o', { startAmount: 1_200_000, payoutAge: 67, payoutYears: 10 })];
    const { summary } = [...simulate(compile({ boxes, wires: [] }, 6))][0];
    closeTo(summary.stocks[0].payoutPerYear!, 240_000, 0.01);
    expect(summary.stocks[0].lastValue).toBeLessThan(0.01);
  });

  it('pays out at once what remains after a term that is already over', () => {
    const boxes = [me(1950), otp('o', { startAmount: 500_000, payoutAge: 65, payoutYears: 10 }), account('a')];
    expect(run({ boxes, wires: [money('o', 'a')] }, 1).end('a')).toBe(500_000);
  });
});

describe('a withdrawal set as a share of accounts that have not opened', () => {
  it('waits for the money instead of locking at 0', () => {
    const boxes = [me(1980), account('early', 0), account('a', 1_200_000, { startDate: '2030-01-01' }), withdrawal('w', 47, 0, { mode: 'percent', percent: 4 })];
    const { pass } = run({ boxes, wires: [money('a', 'w')] }, 5);
    expect(pass.ledger.flows.get('spent:accounts')![3]).toBe(12 * 4_000);
  });
});

describe('what warns', () => {
  it('warns that pension beyond the need is spent when nothing is wired on', () => {
    const boxes = [me(1980), flatG, folketrygd('f', 1_000_000, { payoutAge: 47 }), withdrawal('w', 49, 1_000)];
    expect(diagnose({ boxes, wires: [money('f', 'w')] })).toEqual([{ boxId: 'w', code: 'surplusIsSpent' }]);
    const withAccount = { boxes: [...boxes, account('a')], wires: [money('f', 'w'), money('w', 'a')] };
    expect(diagnose(withAccount)).toEqual([]);
  });

  it('gives a transfer back to the same account no effect, and says so', () => {
    const input = {
      boxes: [account('a', 100_000, { accountType: 'ask', taxRate: 30, inflation: 0 }), transfer('t', 10_000), market('m', 4, 0)],
      wires: [money('a', 't'), money('t', 'a'), influence('m', 'a')],
    };
    expect(diagnose(input)).toEqual([{ boxId: 't', code: 'sameAccount' }]);
    const { summary } = [...simulate(compile(input, 3))][0];
    const without = { boxes: [input.boxes[0], input.boxes[2]], wires: [influence('m', 'a')] };
    const { summary: alone } = [...simulate(compile(without, 3))][0];
    expect(summary.stocks[0].afterTax).toBeCloseTo(alone.stocks[0].afterTax!, 6);
  });
});

describe('Folketrygden when work and pension meet', () => {
  const balance = (retirementAge: number, payoutAge: number, start = START) => {
    const boxes = [me(1980, retirementAge), flatG, income('i', 30_000, { pensionBasis: 600_000 }), folketrygd('f', 0, { payoutAge, divisor: 20, startDate: start })];
    const { summary } = [...simulate(compile({ boxes, wires: [basis('i', 'f')] }, 8))][0];
    return summary.stocks[0];
  };

  it('keeps the last year of earnings, whether the pension starts at once or a year later', () => {
    closeTo(balance(50, 50).lastValue, 4 * 108_600);
    closeTo(balance(50, 51).lastValue, 4 * 108_600);
  });

  it('shows the same balance as the pension is worked out from', () => {
    const stock = balance(50, 50);
    closeTo(stock.lastValue / 20, stock.payoutPerYear!, 0.01);
  });

  it('adds the year before the start also when work stopped on the start date', () => {
    closeTo(balance(50, 52, '2030-01-01').lastValue, 108_600);
  });
});

describe('losses', () => {
  it('cannot take a drained account below 0', () => {
    const boxes = [account('a', 100_000), market('m', -10, 0, 'yearly'), transfer('t', 20_000), account('b')];
    const { end } = run({ boxes, wires: [influence('m', 'a'), money('a', 't'), money('t', 'b')] }, 2);
    expect(end('a')).toBeGreaterThanOrEqual(0);
  });
});

describe('an account that opens after the period', () => {
  it('has no after-tax figure instead of NaN', () => {
    const boxes = [account('early'), account('late', 100, { startDate: '2090-01-01', accountType: 'ask', taxRate: 30, inflation: 0 })];
    const { summary } = [...simulate(compile({ boxes, wires: [] }, 3))][0];
    expect(summary.stocks[1].afterTax).toBeNull();
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

describe('skjermingsfradrag on an ASK', () => {
  const RATE = 0.036;
  const ask = (id: string, startAmount: number, extra: Record<string, unknown> = {}) =>
    account(id, startAmount, { accountType: 'ask', taxRate: 37.84, shieldRate: 3.6, ...extra });
  const shieldAtEnd = (input: SimulationInput, years: number, id = 'a') => {
    const model = compile(input, years);
    return runPass(model, noNoise).shieldAtEnd[model.stocks.findIndex((stock) => stock.id === id)];
  };

  it('earns the rate each 31 December, on the deposits and on what is unused from before', () => {
    const first = 1_000_000 * RATE;
    const second = (1_000_000 + first) * RATE;
    expect(shieldAtEnd({ boxes: [ask('a', 1_000_000)], wires: [] }, 2)).toBeCloseTo(first + second, 2);
  });

  it('has nothing before the first 31 December', () => {
    expect(shieldAtEnd({ boxes: [ask('a', 1_000_000)], wires: [] }, 0.9)).toBe(0);
  });

  it('adds on to what was unused when the simulation started, which earns the rate too', () => {
    const boxes = [ask('a', 1_000_000, { unusedShield: 10_000 })];
    expect(shieldAtEnd({ boxes, wires: [] }, 1)).toBeCloseTo(10_000 + 1_010_000 * RATE, 2);
  });

  it('goes by the lowest deposit balance of the year, so a withdrawal lowers it', () => {
    const boxes = [me(1980), ask('a', 1_000_000), withdrawal('w', 47, 10_000)];
    // Twelve draws of 10 000 have happened by 31 December, and they all count as deposits.
    expect(shieldAtEnd({ boxes, wires: [money('a', 'w')] }, 1)).toBeCloseTo(880_000 * RATE, 2);
  });

  it('gives a deposit no shielding for the months it was not there', () => {
    const boxes = [income('i', 50_000), transfer('t', 10_000), ask('a', 0)];
    const first = 10_000 * RATE;
    // The first pay day is the first day of the period. By the next year all twelve deposits count.
    const second = (120_000 + first) * RATE;
    expect(shieldAtEnd({ boxes, wires: [money('i', 't'), money('t', 'a')] }, 2)).toBeCloseTo(first + second, 2);
  });

  it('loses value with inflation, since the rate and the deposits are in the kroner of the day', () => {
    const boxes = [ask('a', 1_000_000, { inflation: 2.5 })];
    expect(shieldAtEnd({ boxes, wires: [] }, 1)).toBeCloseTo(1_000_000 * RATE * 1.025 ** (-365 / 365.25), 2);
  });

  it('waits for an account that opens later', () => {
    const boxes = [account('early', 100), ask('a', 1_000_000, { startDate: '2028-07-01' })];
    expect(shieldAtEnd({ boxes, wires: [] }, 2)).toBeCloseTo(1_000_000 * RATE, 2);
  });

  describe('used against a gain', () => {
    const drawing = (perMonth: number) => ({
      boxes: [me(1980), ask('a', 100_000, { shieldRate: 0, unusedShield: 5_000 }), market('m', 100, 0, 'yearly'), withdrawal('w', 48, perMonth)],
      wires: [influence('m', 'a'), money('a', 'w')],
    });
    // Up to the first draw on 1 January 2028, when the balance has doubled.
    const UNTIL_AFTER_THE_FIRST_DRAW = 13 / 12;

    it('is left alone while a withdrawal only takes deposits', () => {
      expect(shieldAtEnd(drawing(50_000), UNTIL_AFTER_THE_FIRST_DRAW)).toBeCloseTo(5_000, 2);
    });

    it('is used by what goes beyond the deposits', () => {
      expect(shieldAtEnd(drawing(102_000), UNTIL_AFTER_THE_FIRST_DRAW)).toBeCloseTo(3_000, 2);
    });

    it('cannot go below nothing', () => {
      expect(shieldAtEnd(drawing(150_000), UNTIL_AFTER_THE_FIRST_DRAW)).toBe(0);
    });
  });

  it('lowers the tax if everything is withdrawn, by coming off the gain', () => {
    const input = (shieldRate: number) => ({
      boxes: [ask('a', 1_000_000, { shieldRate }), market('m', 8, 0, 'yearly')],
      wires: [influence('m', 'a')],
    });
    const stockOf = (shieldRate: number) => [...simulate(compile(input(shieldRate), 10))][0].summary.stocks[0];
    const { lastValue, afterTax } = stockOf(3.6);
    const shield = shieldAtEnd(input(3.6), 10);
    expect(afterTax).toBeCloseTo(lastValue - 0.3784 * (lastValue - 1_000_000 - shield), 2);
    expect(afterTax).toBeGreaterThan(stockOf(0).afterTax!);
  });

  it('gives no tax when the shielding is larger than the gain', () => {
    const boxes = [ask('a', 1_000_000, { unusedShield: 5_000_000 }), market('m', 8, 0, 'yearly')];
    const { lastValue, afterTax } = [...simulate(compile({ boxes, wires: [influence('m', 'a')] }, 5))][0].summary.stocks[0];
    expect(afterTax).toBe(lastValue);
  });

  it('moves no money by itself, so no balance changes while nothing is drawn', () => {
    const input = (shieldRate: number) => ({
      boxes: [ask('a', 1_000_000, { shieldRate }), market('m', 5, 15)],
      wires: [influence('m', 'a')],
    });
    const without = runPass(compile(input(0), 10), passNoise(3, 1));
    const withShield = runPass(compile(input(3.6), 10), passNoise(3, 1));
    expect(withShield.series).toEqual(without.series);
    expect(withShield.ledger.deposits).toEqual(without.ledger.deposits);
  });

  it('only exists on an ASK', () => {
    const boxes = [account('a', 1_000_000, { shieldRate: 3.6, unusedShield: 10_000 })];
    expect(shieldAtEnd({ boxes, wires: [] }, 2)).toBe(0);
  });

  it('is drawn on the graph of an ASK, and not on the graph of a regular account', () => {
    const boxes = [ask('a', 1_000_000), ask('none', 1_000_000, { shieldRate: 0 }), account('c', 100_000)];
    const [a, none, c] = [...simulate(compile({ boxes, wires: [] }, 1))][0].summary.stocks;
    expect(a.shield!.at(-1)).toBeCloseTo(1_000_000 * RATE, 2);
    expect(a.deposits!.at(-1)).toBe(1_000_000);
    expect(none.shield).toBeNull();
    expect(none.deposits!.at(-1)).toBe(1_000_000);
    expect(c.shield).toBeNull();
    expect(c.deposits).toBeNull();
  });

  it('shows the return as the gap up to what is left of what was put in, and counts withdrawals as deposits first', () => {
    const boxes = [me(1980), ask('a', 1_000_000, { shieldRate: 0 }), market('m', 10, 0), withdrawal('w', 48, 10_000)];
    const { median, deposits } = [...simulate(compile({ boxes, wires: [influence('m', 'a'), money('a', 'w')] }, 3))][0].summary.stocks[0];
    expect(deposits![0]).toBe(1_000_000);
    // Two years of draws have happened at the last sample, and the balance has grown beyond what was put in.
    expect(deposits!.at(-1)).toBeCloseTo(1_000_000 - 24 * 10_000, 0);
    expect(median.at(-1)).toBeGreaterThan(deposits!.at(-1)!);
  });

  it('keeps the lines inside the graph when they rise above the balance', () => {
    const boxes = [me(1980), ask('a', 1_000_000, { shieldRate: 0 }), withdrawal('w', 47, 40_000)];
    const { deposits, median, yMax } = [...simulate(compile({ boxes, wires: [money('a', 'w')] }, 3))][0].summary.stocks[0];
    expect(deposits![0]).toBe(median[0]);
    expect(yMax).toBeGreaterThanOrEqual(1_000_000);
  });
});

describe('what a withdrawal draws on', () => {
  const lastFrame = (input: SimulationInput, years: number) => [...simulate(compile(input, years), [20])].at(-1)!;
  const first = (input: SimulationInput, years: number) => lastFrame(input, years).summary.withdrawals[0];

  const twoPensions = () => ({
    boxes: [
      me(1980),
      flatG,
      account('fund', 0),
      otp('o', { startAmount: 43_000 * 120, payoutAge: 47, payoutYears: 10 }),
      folketrygd('f', 20_000 * 12 * 20, { payoutAge: 47, divisor: 20 }),
      withdrawal('w', 47, 40_000),
    ],
    wires: [money('fund', 'w'), money('o', 'w'), money('f', 'w'), money('w', 'fund')],
  });

  it('shows what each box pays in kroner a month, with the pensions first since they count first', () => {
    const shown = first(twoPensions(), 12);
    expect(shown.sources.map((source) => source.name)).toEqual(['o', 'f', 'fund']);
    const [o, f, fund] = shown.sources;
    expect(o.perMonth[0]).toBeCloseTo(43_000, 0);
    expect(f.perMonth[0]).toBeCloseTo(20_000, 0);
    expect(fund.perMonth[0]).toBe(0);
    // The occupational pension has stopped, and the savings cover the rest of the 40 000.
    expect(o.perMonth[10]).toBe(0);
    expect(f.perMonth[10]).toBeCloseTo(20_000, 0);
    expect(fund.perMonth[10]).toBeCloseTo(20_000, 0);
  });

  it('shows the need, and what the pensions pay beyond it and where that goes', () => {
    const shown = first(twoPensions(), 12);
    expect(shown.need[0]).toBe(40_000);
    expect(shown.surplus[0]).toBeCloseTo(23_000, 0);
    expect(shown.surplus[10]).toBe(0);
    expect(shown.surplusTo).toBe('fund');
    expect(shown.short[0]).toBe(0);
  });

  it('says that the surplus counts as spent when nothing takes it', () => {
    const { boxes, wires } = twoPensions();
    expect(first({ boxes, wires: wires.filter((wire) => wire.source !== 'w') }, 2).surplusTo).toBeNull();
  });

  it('shows what is missing when the money runs out', () => {
    const boxes = [me(1980), account('a', 120_000), withdrawal('w', 47, 10_000)];
    const shown = first({ boxes, wires: [money('a', 'w')] }, 3);
    expect(shown.sources[0].perMonth[0]).toBeCloseTo(10_000, 0);
    expect(shown.short[0]).toBeCloseTo(0, 0);
    expect(shown.sources[0].perMonth[1]).toBeCloseTo(0, 0);
    expect(shown.short[1]).toBeCloseTo(10_000, 0);
  });

  // The whole point of a mean, since the median of each would not add up in the years some passes run out.
  it('always adds up: what the boxes pay is the need, plus what goes on, less what is missing', () => {
    const boxes = [
      me(1980),
      flatG,
      account('fund', 1_500_000),
      market('m', 3, 20),
      otp('o', { startAmount: 3_000_000, payoutAge: 50, payoutYears: 5 }),
      withdrawal('w', 47, 30_000),
    ];
    const wires = [influence('m', 'fund'), money('fund', 'w'), money('o', 'w'), money('w', 'fund')];
    const shown = first({ boxes, wires }, 30);
    const someShort = shown.short.some((value) => value > 0 && value < 30_000);
    expect(someShort).toBe(true);
    shown.need.forEach((need, year) => {
      const paid = shown.sources.reduce((sum, source) => sum + source.perMonth[year], 0);
      expect(paid + shown.short[year]).toBeCloseTo(need + shown.surplus[year], 4);
    });
  });

  it('gives each withdrawal its own share of an account they both draw on', () => {
    const boxes = [me(1980), account('a', 10_000_000), withdrawal('w1', 47, 10_000), withdrawal('w2', 47, 5_000)];
    const { withdrawals } = lastFrame({ boxes, wires: [money('a', 'w1'), money('a', 'w2')] }, 2).summary;
    expect(withdrawals.map(({ id }) => id)).toEqual(['w1', 'w2']);
    expect(withdrawals[0].sources[0].perMonth[0]).toBeCloseTo(10_000, 0);
    expect(withdrawals[1].sources[0].perMonth[0]).toBeCloseTo(5_000, 0);
  });

  it('follows the accounts when the need is a share of them', () => {
    const boxes = [me(1980), account('a', 1_200_000), withdrawal('w', 47, 0, { mode: 'percent', percent: 12 })];
    const shown = first({ boxes, wires: [money('a', 'w')] }, 2);
    expect(shown.need[0]).toBeCloseTo(12_000, 0);
    expect(shown.sources[0].perMonth[0]).toBeCloseTo(12_000, 0);
  });

  it('adds up all that was paid over the whole period', () => {
    const boxes = [me(1980), account('a', 1_000_000), market('m', 10, 0), withdrawal('w', 48, 10_000)];
    // The day the period ends is a payday as well.
    expect(first({ boxes, wires: [influence('m', 'a'), money('a', 'w')] }, 3).withdrawn).toBeCloseTo(25 * 10_000, 0);
  });

  it('leaves out a box that never pays, and the others keep their place', () => {
    const boxes = [me(1980), otp('never'), account('a', 1_000_000), withdrawal('w', 47, 10_000)];
    const shown = first({ boxes, wires: [money('never', 'w'), money('a', 'w')] }, 2);
    expect(shown.sources.map(({ name, slot }) => [name, slot])).toEqual([['a', 1]]);
  });

  it('gets the level right in years the period only partly covers', () => {
    const boxes = [me(1980), account('a', 1_000_000, { startDate: '2027-07-01' }), withdrawal('w', 47, 10_000)];
    for (const value of first({ boxes, wires: [money('a', 'w')] }, 2).sources[0].perMonth) expect(value).toBeCloseTo(10_000, 0);
  });

  it('knows where each calendar year begins and ends', () => {
    const { yearEdges, need } = first(twoPensions(), 2);
    expect(yearEdges).toHaveLength(need.length + 1);
    expect(yearEdges[0]).toBe(0);
    expect(yearEdges[1]).toBe(365);
    expect(yearEdges.at(-1)).toBe(Math.round(2 * 365.25));
  });

  it('keeps its scale from the first summary, so the graph does not jump', () => {
    const boxes = [me(1980), account('a', 1_000_000), market('m', 5, 15), withdrawal('w', 47, 10_000)];
    const frames = [...simulate(compile({ boxes, wires: [influence('m', 'a'), money('a', 'w')] }, 5), [4, 20])];
    expect(frames[1].summary.withdrawals[0].perMonthMax).toBe(frames[0].summary.withdrawals[0].perMonthMax);
  });

  it('does not count a pension paid straight into an account', () => {
    const pension = folketrygd('f', 2_000_000, { payoutAge: 47, divisor: 20 });
    const boxes = [me(1980), flatG, account('a', 1_000_000), pension, withdrawal('w', 47, 10_000)];
    const shown = first({ boxes, wires: [money('f', 'a'), money('a', 'w')] }, 1);
    expect(shown.sources.map((source) => source.name)).toEqual(['a']);
  });

  it('shows nothing while nothing is wired to it, or without a birth year', () => {
    const wired = { boxes: [me(1980), account('a', 100_000), withdrawal('w', 47, 1_000)], wires: [money('a', 'w')] };
    expect(lastFrame(wired, 1).summary.withdrawals).toHaveLength(1);
    expect(lastFrame({ ...wired, wires: [] }, 1).summary.withdrawals).toEqual([]);
    expect(lastFrame({ ...wired, boxes: [account('a', 100_000), withdrawal('w', 47, 1_000)] }, 1).summary.withdrawals).toEqual([]);
  });

  it('changes no balance by being read, and each pass plays only what has a graph', () => {
    const { boxes, wires } = twoPensions();
    const { passes, summary } = lastFrame({ boxes, wires }, 12);
    expect(summary.stocks.map((stock) => stock.id)).toEqual(['fund', 'o', 'f']);
    for (const pass of passes) expect(pass).toHaveLength(summary.stocks.length);
  });
});

describe('tax on a withdrawal', () => {
  const TAX = 0.5;
  // 100 000 that has about doubled by 1 January 2028, the day of the first draw, and that is the only draw.
  const DOUBLED = { startAge: 48, years: 1.02 };
  // Stocks are numbered in the order of the boxes, and the first box here that has one is the account.
  const ACCOUNT = 0;
  const ask = (id: string, startAmount: number, extra: Record<string, unknown> = {}) =>
    account(id, startAmount, { accountType: 'ask', taxRate: TAX * 100, shieldRate: 0, ...extra });
  const doubling = (perMonth: number, fund = ask('a', 100_000)) => {
    const input = {
      boxes: [me(1980), fund, market('m', 100, 0, 'yearly'), withdrawal('w', DOUBLED.startAge, perMonth)],
      wires: [influence('m', 'a'), money('a', 'w')],
    };
    return run(input, DOUBLED.years);
  };
  const flow = (pass: PassResult, label: string) => (pass.ledger.flows.get(label) ?? new Float64Array(1)).reduce((sum, amount) => sum + amount, 0);
  // The first calendar year has twelve paydays. A period that ends on New Year's Day also has one more on that day.
  const firstYear = (pass: PassResult, label: string) => (pass.ledger.flows.get(label)?.[0] ?? 0) / 12;
  const lastFrame = (input: SimulationInput, years: number) => [...simulate(compile(input, years), [20])].at(-1)!;

  it('takes none from a regular account', () => {
    const { pass } = doubling(150_000, account('a', 100_000, { taxRate: 50 }));
    expect(flow(pass, 'spent:accounts')).toBeCloseTo(150_000, 2);
    expect(flow(pass, 'tax:gain')).toBe(0);
    expect(pass.ledger.out[ACCOUNT]).toBeCloseTo(150_000, 2);
  });

  it('takes none while the withdrawal is covered by deposits and shielding, so the first withdrawals are free', () => {
    const { pass } = doubling(104_000, ask('a', 100_000, { unusedShield: 5_000 }));
    expect(flow(pass, 'spent:accounts')).toBeCloseTo(104_000, 2);
    expect(flow(pass, 'tax:gain')).toBe(0);
  });

  it('draws more when it goes beyond them, so what is left is the amount asked for', () => {
    const { pass } = doubling(140_000);
    // 100 000 of deposits is free, and the remaining 40 000 needs 80 000 before tax.
    expect(flow(pass, 'spent:accounts')).toBeCloseTo(140_000, 2);
    expect(flow(pass, 'tax:gain')).toBeCloseTo(40_000, 2);
    expect(pass.ledger.out[ACCOUNT]).toBeCloseTo(180_000, 2);
  });

  it('lets shielding lower the tax', () => {
    const tax = (unusedShield: number) => flow(doubling(120_000, ask('a', 100_000, { unusedShield })).pass, 'tax:gain');
    expect(tax(0)).toBeCloseTo(20_000, 2);
    expect(tax(10_000)).toBeCloseTo(10_000, 2);
  });

  it('uses up the shielding it goes through', () => {
    const model = compile(
      { boxes: [me(1980), ask('a', 100_000, { unusedShield: 5_000 }), market('m', 100, 0, 'yearly'), withdrawal('w', 48, 150_000)], wires: [influence('m', 'a'), money('a', 'w')] },
      DOUBLED.years,
    );
    expect(runPass(model, noNoise).ledger.shield[1]).toBe(0);
  });

  it('keeps the books right: what is in an account is what came in, grew and went out', () => {
    const { pass } = doubling(140_000);
    const { closing, ledger } = pass;
    expect(closing[ACCOUNT]).toBeCloseTo(100_000 + ledger.in[ACCOUNT] + ledger.growth[ACCOUNT] - ledger.out[ACCOUNT], 6);
    expect(ledger.out[ACCOUNT]).toBeCloseTo(flow(pass, 'spent:accounts') + flow(pass, 'tax:gain'), 6);
  });

  it('draws from several accounts by size, and together they leave the amount asked for', () => {
    const boxes = [me(1980), ask('a', 100_000), account('b', 100_000), market('m', 100, 0, 'yearly'), withdrawal('w', 48, 300_000)];
    const wires = [influence('m', 'a'), influence('m', 'b'), money('a', 'w'), money('b', 'w')];
    const { pass } = run({ boxes, wires }, DOUBLED.years);
    expect(flow(pass, 'spent:accounts')).toBeCloseTo(300_000, 2);
    // The same share of each: 400 000 s - 0.5 (200 000 s - 100 000) = 300 000.
    const share = 250_000 / 300_000;
    expect(flow(pass, 'tax:gain')).toBeCloseTo(0.5 * (200_000 * share - 100_000), 2);
    expect(pass.closing[0]).toBeCloseTo(pass.closing[1], 2);
  });

  it('says what is missing when the accounts cannot pay it after tax', () => {
    const { pass } = doubling(190_000);
    const spent = flow(pass, 'spent:accounts');
    // All of it goes, and the deposits were free, so half of the rest goes to tax.
    expect(pass.closing[ACCOUNT]).toBeCloseTo(0, 2);
    expect(flow(pass, 'tax:gain')).toBeCloseTo((pass.ledger.out[ACCOUNT] - 100_000) / 2, 2);
    expect(flow(pass, 'unmet')).toBeCloseTo(190_000 - spent, 2);
    expect(pass.ledger.short[ACCOUNT + 1]).toBeCloseTo(190_000 - spent, 2);
  });

  it('makes the money run out sooner when there is a gain', () => {
    const input = (accountType: string) => ({
      boxes: [me(1980), account('a', 1_000_000, { accountType, taxRate: 50, shieldRate: 0 }), market('m', 8, 0, 'yearly'), withdrawal('w', 47, 8_000)],
      wires: [influence('m', 'a'), money('a', 'w')],
    });
    const left = (accountType: string) => run(input(accountType), 15).pass.closing[ACCOUNT];
    expect(left('regular')).toBeGreaterThan(0);
    expect(left('ask')).toBeLessThan(left('regular'));
  });

  describe('on pension', () => {
    const PENSION = 30_000;
    const national = (perMonth = PENSION) => folketrygd('f', perMonth * 12 * 20, { payoutAge: 47, divisor: 20 });

    it('leaves the pension after tax to count, so the accounts cover more', () => {
      const boxes = [me(1980), flatG, account('a', 1_000_000), national(), withdrawal('w', 47, 40_000, { pensionTax: 24 })];
      const { pass } = run({ boxes, wires: [money('f', 'w'), money('a', 'w')] }, 1);
      expect(firstYear(pass, 'tax:pension')).toBeCloseTo(7_200, 2);
      expect(firstYear(pass, 'spent:pension')).toBeCloseTo(22_800, 2);
      expect(firstYear(pass, 'spent:accounts')).toBeCloseTo(17_200, 2);
    });

    it('sends on only what is left after tax', () => {
      const boxes = [me(1980), flatG, account('a', 0), national(60_000), withdrawal('w', 47, 40_000, { pensionTax: 25 })];
      const { pass } = run({ boxes, wires: [money('f', 'w'), money('a', 'w'), money('w', 'a')] }, 1);
      expect(firstYear(pass, 'surplus')).toBeCloseTo(5_000, 2);
      expect(pass.ledger.in[ACCOUNT]).toBeCloseTo(flow(pass, 'surplus'), 2);
    });

    it('also taxes pension that comes before the withdrawal starts', () => {
      const boxes = [me(1980), flatG, national(), withdrawal('w', 60, 40_000, { pensionTax: 50 })];
      const { pass } = run({ boxes, wires: [money('f', 'w')] }, 1);
      expect(firstYear(pass, 'tax:pension')).toBeCloseTo(15_000, 2);
      expect(firstYear(pass, 'surplus')).toBeCloseTo(15_000, 2);
    });

    it('does not tax pension twice while it waits for an account to open', () => {
      const late = account('a', 0, { startDate: '2028-01-01' });
      const boxes = [account('first', 100), me(1980), flatG, late, national(), withdrawal('w', 60, 40_000, { pensionTax: 50 })];
      const { pass } = run({ boxes, wires: [money('f', 'w'), money('w', 'a')] }, 2);
      const paidIn = flow(pass, `payout:f`);
      expect(flow(pass, 'tax:pension')).toBeCloseTo(paidIn * 0.5, 2);
    });

    it('keeps the rate within what makes sense', () => {
      const tax = (pensionTax: number) => {
        const boxes = [me(1980), flatG, national(), withdrawal('w', 60, 1_000, { pensionTax })];
        return firstYear(run({ boxes, wires: [money('f', 'w')] }, 1).pass, 'tax:pension');
      };
      expect(tax(-10)).toBe(0);
      expect(tax(150)).toBeCloseTo(PENSION, 2);
    });
  });

  describe('as a share of the accounts', () => {
    const percent = { mode: 'percent', percent: 12 };

    it('is what is drawn, and the tax comes out of it', () => {
      const boxes = [me(1980), ask('a', 1_200_000), withdrawal('w', 47, 0, percent)];
      const { pass } = run({ boxes, wires: [money('a', 'w')] }, 1);
      expect(firstYear(pass, 'spent:accounts')).toBeCloseTo(12_000, 2);
      expect(flow(pass, 'tax:gain')).toBe(0);
    });

    it('leaves less than the share when it goes beyond what is free of tax', () => {
      const boxes = [me(1980), ask('a', 100_000), market('m', 100, 0, 'yearly'), withdrawal('w', 48, 0, { mode: 'percent', percent: 900 })];
      // 900 % of about 200 000 a year is about 150 000 a month before tax: 100 000 free, and half of the rest is left.
      const { pass } = run({ boxes, wires: [influence('m', 'a'), money('a', 'w')] }, DOUBLED.years);
      const drawn = pass.ledger.out[ACCOUNT];
      expect(drawn).toBeGreaterThan(140_000);
      expect(flow(pass, 'tax:gain')).toBeCloseTo((drawn - 100_000) / 2, 2);
      expect(flow(pass, 'spent:accounts')).toBeCloseTo(drawn - (drawn - 100_000) / 2, 2);
    });

    it('lets the pension count before tax, so tax on it does not make the accounts pay more', () => {
      const pension = folketrygd('f', 2_000 * 12 * 20, { payoutAge: 47, divisor: 20 });
      const boxes = [me(1980), flatG, account('a', 1_200_000), pension, withdrawal('w', 47, 0, { ...percent, pensionTax: 50 })];
      const { pass } = run({ boxes, wires: [money('f', 'w'), money('a', 'w')] }, 1);
      expect(firstYear(pass, 'spent:accounts')).toBeCloseTo(10_000, 2);
      expect(firstYear(pass, 'spent:pension')).toBeCloseTo(1_000, 2);
    });
  });

  describe('in what the withdrawal shows', () => {
    const shownOf = (input: SimulationInput, years: number) => lastFrame(input, years).summary.withdrawals[0];
    const national = () => folketrygd('f', 30_000 * 12 * 20, { payoutAge: 47, divisor: 20 });

    it('shows what each box leaves after tax, and the tax on top', () => {
      const boxes = [me(1980), flatG, account('a', 10_000_000), national(), withdrawal('w', 47, 40_000, { pensionTax: 24 })];
      const shown = shownOf({ boxes, wires: [money('f', 'w'), money('a', 'w')] }, 2);
      const [pension, fund] = shown.sources;
      expect(pension.perMonth[0]).toBeCloseTo(22_800, 0);
      expect(fund.perMonth[0]).toBeCloseTo(17_200, 0);
      expect(shown.need[0]).toBe(40_000);
      expect(shown.tax[0]).toBeCloseTo(7_200, 0);
      expect(shown.perMonthMax).toBeGreaterThanOrEqual(47_200);
    });

    it('adds up the whole period', () => {
      const boxes = [me(1980), flatG, account('a', 10_000_000), national(), withdrawal('w', 47, 40_000, { pensionTax: 24 })];
      const shown = shownOf({ boxes, wires: [money('f', 'w'), money('a', 'w')] }, 2);
      // The day the period ends is a payday as well.
      expect(shown.withdrawn).toBeCloseTo(25 * 40_000, 0);
      expect(shown.taxPaid).toBeCloseTo(25 * 7_200, 0);
    });

    it('shows no tax on a regular account', () => {
      const shown = shownOf({ boxes: [me(1980), account('a', 1_000_000), withdrawal('w', 47, 10_000)], wires: [money('a', 'w')] }, 1);
      expect(shown.taxPaid).toBe(0);
      expect(Array.from(shown.tax).every((amount) => amount === 0)).toBe(true);
    });

    it('still adds up with tax and markets in it', () => {
      const boxes = [
        me(1980),
        flatG,
        ask('fund', 1_500_000, { taxRate: 37.84, shieldRate: 3.6 }),
        market('m', 3, 20),
        otp('o', { startAmount: 3_000_000, payoutAge: 50, payoutYears: 5 }),
        withdrawal('w', 47, 30_000, { pensionTax: 24 }),
      ];
      const wires = [influence('m', 'fund'), money('fund', 'w'), money('o', 'w'), money('w', 'fund')];
      const shown = shownOf({ boxes, wires }, 30);
      expect(shown.short.some((value) => value > 0)).toBe(true);
      shown.need.forEach((need, year) => {
        const paid = shown.sources.reduce((sum, source) => sum + source.perMonth[year], 0);
        expect(paid + shown.short[year]).toBeCloseTo(need + shown.surplus[year], 4);
      });
    });

    it('calls the need what a share of the accounts leaves after tax, so it adds up as well', () => {
      const boxes = [me(1980), ask('a', 100_000), market('m', 100, 0, 'yearly'), withdrawal('w', 48, 0, { mode: 'percent', percent: 900 })];
      const shown = shownOf({ boxes, wires: [influence('m', 'a'), money('a', 'w')] }, DOUBLED.years);
      const year = shown.need.findIndex((need) => need > 0);
      expect(shown.need[year] + shown.surplus[year]).toBeCloseTo(shown.sources[0].perMonth[year] + shown.short[year], 4);
      expect(shown.tax[year]).toBeGreaterThan(0);
    });
  });
});
