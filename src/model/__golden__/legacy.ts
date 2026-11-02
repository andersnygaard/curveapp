// Translates the old scenario format and repeats the old way of drawing passes, only so that the numbers
// recorded from the old engine can be compared with the new one.
import type { Model } from '../../engine/engine';
import { runPass } from '../../engine/engine';
import { gaussian, noNoise, seededRandom, type NoiseSource } from '../../engine/random';
import { gDefaults } from '../boxes/g';
import type { IncomeInterval } from '../boxes/pay';
import type { ReturnInterval } from '../boxes/returnBox';
import { wireOf } from '../graph';
import type { Box, SimulationInput, Wire } from '../types';

export interface LegacyAccount {
  id: string;
  name: string;
  startAmount: number;
  startDate: string;
  currency: string;
  annualRate: number;
  returnInterval: ReturnInterval;
  volatility: number;
  pensionSavings?: { lowRate: number; highRate: number; incomeIds: string[] };
  ask?: { taxRate: number; inflation: number };
}

export interface LegacyScenario {
  accounts: LegacyAccount[];
  incomes: { id: string; name: string; amount: number; interval: IncomeInterval }[];
  transfers: { id: string; name: string; amount: number; incomeId: string; accountId: string }[];
  pensions: { id: string; name: string; startAmount: number; startDate: string; currency: string; incomeIds: string[] }[];
  g: { value: number; growth: number; volatility: number };
}

const PAYMENTS: Record<IncomeInterval, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

export function toInput(scenario: LegacyScenario): SimulationInput {
  const boxes: Box[] = [];
  const wires: Wire[] = [];

  for (const { id, name, amount, interval } of scenario.incomes) {
    boxes.push({
      id,
      type: 'income',
      data: { name, amount, interval, pensionBasis: amount * PAYMENTS[interval], stopsAtRetirement: false },
    });
  }

  for (const account of scenario.accounts) {
    const { id, name, startAmount, startDate, currency, annualRate, returnInterval, volatility } = account;
    if (account.pensionSavings) {
      const { lowRate, highRate, incomeIds } = account.pensionSavings;
      boxes.push({
        id,
        type: 'otp',
        data: { name, startAmount, startDate, lowRate: lowRate * 100, highRate: highRate * 100, payoutAge: null, payoutYears: 10 },
      });
      for (const incomeId of incomeIds) wires.push(wireOf(incomeId, id, 'basis'));
    } else {
      boxes.push({
        id,
        type: 'account',
        data: {
          name,
          startAmount,
          startDate,
          currency,
          accountType: account.ask ? 'ask' : 'regular',
          taxRate: (account.ask?.taxRate ?? 0) * 100,
          inflation: (account.ask?.inflation ?? 0) * 100,
        },
      });
    }
    boxes.push({
      id: `${id}-return`,
      type: 'return',
      data: { name: 'R', annualReturn: annualRate * 100, returnInterval, standardDeviation: volatility * 100 },
    });
    wires.push(wireOf(`${id}-return`, id, 'influence'));
  }

  for (const { id, name, startAmount, startDate, incomeIds } of scenario.pensions) {
    boxes.push({ id, type: 'folketrygd', data: { name, startAmount, startDate, payoutAge: null, divisor: null } });
    for (const incomeId of incomeIds) wires.push(wireOf(incomeId, id, 'basis'));
  }

  for (const { id, name, amount, incomeId, accountId } of scenario.transfers) {
    boxes.push({ id, type: 'transfer', data: { name, amount, interval: 'monthly' } });
    wires.push(wireOf(incomeId, id, 'money'), wireOf(id, accountId, 'money'));
  }

  const { value, growth, volatility } = scenario.g;
  boxes.push({
    id: 'g',
    type: 'g',
    data: { ...gDefaults(), g: value, gGrowth: growth * 100, standardDeviation: volatility * 100 },
  });
  return { boxes, wires };
}

// The same scenario as the old app stored it in the browser.
export function toVersion1(scenario: LegacyScenario) {
  const at = { x: 0, y: 0 };
  const nodes = [
    ...scenario.incomes.map(({ id, name, amount, interval }) => ({ id, type: 'income', position: at, data: { name, amount, interval } })),
    ...scenario.accounts.map((account) => {
      const { id, name, startAmount, startDate, currency, annualRate, returnInterval, volatility, pensionSavings, ask } = account;
      const common = { name, startAmount, startDate, annualReturn: annualRate * 100, returnInterval, standardDeviation: volatility * 100 };
      return pensionSavings
        ? { id, type: 'otp', position: at, data: { ...common, lowRate: pensionSavings.lowRate * 100, highRate: pensionSavings.highRate * 100 } }
        : {
            id,
            type: 'account',
            position: at,
            data: { ...common, currency, accountType: ask ? 'ask' : 'regular', taxRate: (ask?.taxRate ?? 0) * 100, inflation: (ask?.inflation ?? 0) * 100 },
          };
    }),
    ...scenario.pensions.map(({ id, name, startAmount, startDate }) => ({ id, type: 'pension', position: at, data: { name, startAmount, startDate } })),
    ...scenario.transfers.map(({ id, name, amount }) => ({ id, type: 'transfer', position: at, data: { name, amount } })),
    {
      id: 'g',
      type: 'g',
      position: at,
      data: { g: scenario.g.value, gGrowth: scenario.g.growth * 100, standardDeviation: scenario.g.volatility * 100 },
    },
    { id: 'me', type: 'me', position: at, data: { birthYear: 0 } },
  ];
  const edges = [
    ...scenario.transfers.flatMap(({ id, incomeId, accountId }) => [
      { source: incomeId, target: id },
      { source: id, target: accountId },
    ]),
    ...scenario.accounts.flatMap(({ id, pensionSavings }) => (pensionSavings?.incomeIds ?? []).map((source) => ({ source, target: id }))),
    ...scenario.pensions.flatMap(({ id, incomeIds }) => incomeIds.map((source) => ({ source, target: id }))),
  ];
  return { nodes, edges };
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

// The old engine used one stream of random numbers for everything, 200 test passes and mirrored batches.
export function oldDraws(model: Model, seed: number) {
  const random = seededRandom(seed);
  const draw = () => gaussian(random);
  const shared: NoiseSource = () => draw;
  const expected = runPass(model, noNoise);
  const run = () => runPass(model, shared);
  const last = model.sampleDays.length - 1;
  const pilots = Array.from({ length: 200 }, run);
  const yMax = model.charted.map((_, chart) => {
    const ends = pilots.map((pass) => pass.series[chart][last]).sort((a, b) => a - b);
    return Math.max(ends[Math.floor(ends.length * 0.95)], expected.series[chart][last]) * 1.05 || 1;
  });
  const mirror = (series: Float64Array[]) =>
    series.map((values, chart) =>
      Float64Array.from(values, (value, sample) => {
        const target = expected.series[chart][sample];
        return target === 0 ? 0 : (target * target) / value;
      }),
    );
  let queue: Float64Array[][] = [];
  function nextPass() {
    if (queue.length === 0) {
      for (let pair = 0; pair < 10; pair++) {
        const pass = run().series;
        queue.push(pass, mirror(pass));
      }
      shuffle(queue, random);
    }
    return queue.pop()!;
  }
  return { expected, yMax, nextPass };
}
