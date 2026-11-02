import type { IncomeInterval, Interval, PensionSavings, Scenario } from './scenario';

export const DAY_MS = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MAX_SAMPLES = 400;
const PAIRS_PER_BATCH = 10;
const PILOT_RUNS = 200;
const PAYMENTS_PER_YEAR: Record<IncomeInterval, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };
const PENSION_RATE = 0.181;
const PENSION_CAP_IN_G = 7.1;
const SAVINGS_LOW_CAP_IN_G = 7.1;
const SAVINGS_HIGH_CAP_IN_G = 12;
const LOWEST_G_GROWTH = -0.9;

// One value per sample for each account.
export type Pass = number[][];

export interface AccountSeries {
  id: string;
  name: string;
  currency: string;
  calculated: boolean;
  expected: number[];
  yMax: number;
  afterTax?: number;
}

export interface Simulation {
  startMs: number;
  totalDays: number;
  sampleDays: number[];
  accounts: AccountSeries[];
  nextPass: () => Pass;
}

function firesOn(interval: Interval, date: Date): boolean {
  const weekday = date.getUTCDay();
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth();
  switch (interval) {
    case 'daily':
      return true;
    case 'tradingDays':
      return weekday >= 1 && weekday <= 5;
    case 'weekly':
      return weekday === 1;
    case 'monthly':
      return dayOfMonth === 1;
    case 'quarterly':
      return dayOfMonth === 1 && month % 3 === 0;
    case 'yearly':
      return dayOfMonth === 1 && month === 0;
  }
}

function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export function createSimulation(scenario: Scenario, years: number, random: () => number = Math.random): Simulation {
  const { accounts, incomes, transfers, pensions, g: baseAmount } = scenario;
  const entries = [...accounts, ...pensions];
  const startMs = Math.min(...entries.map((entry) => Date.parse(entry.startDate)));
  const totalDays = Math.round(years * DAYS_PER_YEAR);

  const sampleEvery = Math.ceil(totalDays / MAX_SAMPLES);
  const sampleDays: number[] = [];
  for (let day = 0; day < totalDays; day += sampleEvery) sampleDays.push(day);
  sampleDays.push(totalDays);

  const calendar = new Map<string, Uint8Array>();
  function firingDays(interval: Interval, offsetDays = 0): Uint8Array {
    const key = `${interval}:${offsetDays}`;
    let days = calendar.get(key);
    if (!days) {
      days = new Uint8Array(totalDays + 1);
      for (let day = 0; day <= totalDays; day++) {
        days[day] = firesOn(interval, new Date(startMs + (day + offsetDays) * DAY_MS)) ? 1 : 0;
      }
      calendar.set(key, days);
    }
    return days;
  }

  const accountIndex = new Map(accounts.map((account, index) => [account.id, index]));
  const startDays = entries.map((entry) => Math.round((Date.parse(entry.startDate) - startMs) / DAY_MS));

  const flows = transfers.flatMap((transfer) => {
    const income = incomes.find((candidate) => candidate.id === transfer.incomeId);
    const account = accountIndex.get(transfer.accountId);
    if (!income || account === undefined) return [];
    return [{ account, amount: transfer.amount, fires: firingDays(income.interval) }];
  });

  const growth = accounts.map((account, index) => {
    // Income arrives on the first day of a period, while monthly and yearly returns are paid on the last.
    const paidOnLastDay = account.returnInterval === 'monthly' || account.returnInterval === 'yearly';
    return {
      account: index,
      dailyRate: (1 + account.annualRate) ** (1 / DAYS_PER_YEAR) - 1,
      volatility: account.volatility,
      fires: firingDays(account.returnInterval, paidOnLastDay ? 1 : 0),
    };
  });

  const regulationDays = new Uint8Array(totalDays + 1);
  for (let day = 0; day <= totalDays; day++) {
    const date = new Date(startMs + day * DAY_MS);
    regulationDays[day] = date.getUTCMonth() === 4 && date.getUTCDate() === 1 ? 1 : 0;
  }
  const yearEndDays = firingDays('yearly', 1);

  function annualSalary(incomeIds: string[]): number {
    return incomes
      .filter((income) => incomeIds.includes(income.id))
      .reduce((sum, income) => sum + income.amount * PAYMENTS_PER_YEAR[income.interval], 0);
  }

  const pensionPlans = pensions.map((pension, index) => ({
    entry: accounts.length + index,
    regulatedThisYear: new Date(pension.startDate).getUTCMonth() >= 4,
    salary: annualSalary(pension.incomeIds),
  }));

  // Each payment of an income deposits that payment's share of the year's savings.
  const savingsFlows = accounts.flatMap((account, index) => {
    const savings = account.pensionSavings;
    if (!savings) return [];
    const salary = annualSalary(savings.incomeIds);
    return incomes
      .filter((income) => savings.incomeIds.includes(income.id) && income.amount > 0)
      .map((income) => ({
        account: index,
        savings,
        salary,
        share: income.amount / salary,
        fires: firingDays(income.interval),
      }));
  });
  const usesG = pensionPlans.length > 0 || savingsFlows.length > 0;

  // Salary follows G, so it keeps its place relative to the caps.
  function salaryAt(salary: number, g: number): number {
    return (salary * g) / baseAmount.value;
  }

  // A year's earnings use the average G: four months at last year's G and eight at this year's.
  function pensionEarnings(salary: number, previousG: number, g: number): number {
    const averageG = (4 * previousG + 8 * g) / 12;
    return PENSION_RATE * Math.min(salaryAt(salary, g), PENSION_CAP_IN_G * averageG);
  }

  function savingsDeposit(savings: PensionSavings, salary: number, g: number): number {
    const low = Math.min(salaryAt(salary, g), SAVINGS_LOW_CAP_IN_G * g);
    const upToHighCap = Math.min(salaryAt(salary, g), SAVINGS_HIGH_CAP_IN_G * g);
    return savings.lowRate * low + savings.highRate * (upToHighCap - low);
  }

  // Returns build up every day and are paid out when the box fires, so 8 % means 8 % a year on any
  // interval. The random shock has a median of 1, and noise that is always 0 gives the expected path.
  function run(noise: () => number): Pass {
    const balances = entries.map(() => 0);
    const accrued = growth.map(() => 0);
    const daysSincePayout = growth.map(() => 0);
    const series: Pass = entries.map(() => new Array<number>(sampleDays.length));
    let nextSample = 0;

    // Every box in a pass follows the same G. G before the start is unknown and is estimated from the
    // expected growth.
    let g = baseAmount.value;
    let previousG = g / (1 + baseAmount.growth);
    const pendingEarnings = pensionPlans.map(() => 0);

    for (let day = 0; day <= totalDays; day++) {
      entries.forEach((entry, index) => {
        if (startDays[index] === day) balances[index] = entry.startAmount;
      });

      if (sampleDays[nextSample] === day) {
        for (let index = 0; index < entries.length; index++) series[index][nextSample] = balances[index];
        nextSample++;
      }

      if (usesG && regulationDays[day] && day > 0) {
        const growthThisYear = Math.max(LOWEST_G_GROWTH, baseAmount.growth + baseAmount.volatility * noise());
        previousG = g;
        g *= 1 + growthThisYear;
        for (const plan of pensionPlans) {
          if (day > startDays[plan.entry]) balances[plan.entry] *= 1 + growthThisYear;
        }
      }

      // Earnings reach the balance at the end of the following year, so the first year end adds last year's.
      pensionPlans.forEach((plan, index) => {
        if (day === startDays[plan.entry]) {
          pendingEarnings[index] = plan.regulatedThisYear
            ? pensionEarnings(plan.salary, previousG / (1 + baseAmount.growth), previousG)
            : pensionEarnings(plan.salary, previousG, g);
        }
        if (yearEndDays[day] && day >= startDays[plan.entry]) {
          balances[plan.entry] += pendingEarnings[index];
          pendingEarnings[index] = pensionEarnings(plan.salary, previousG, g);
        }
      });

      growth.forEach((box, index) => {
        accrued[index] += (balances[box.account] + accrued[index]) * box.dailyRate;
        daysSincePayout[index]++;
        if (!box.fires[day]) return;
        balances[box.account] += accrued[index];
        balances[box.account] *= Math.exp(box.volatility * Math.sqrt(daysSincePayout[index] / DAYS_PER_YEAR) * noise());
        accrued[index] = 0;
        daysSincePayout[index] = 0;
      });

      for (const flow of flows) {
        if (flow.fires[day]) balances[flow.account] += flow.amount;
      }
      for (const flow of savingsFlows) {
        if (flow.fires[day]) balances[flow.account] += savingsDeposit(flow.savings, flow.salary, g) * flow.share;
      }
    }
    return series;
  }

  const expected = run(() => 0);
  const randomNoise = () => gaussian(random);

  // A pass and its mirror lie on opposite sides of the expected path at every sample, so the expected
  // path stays the exact median even with deposits, where a plain Monte Carlo median would drift above it.
  function mirror(pass: Pass): Pass {
    return pass.map((series, account) =>
      series.map((value, sample) => {
        const target = expected[account][sample];
        return target === 0 ? 0 : (target * target) / value;
      }),
    );
  }

  let queue: Pass[] = [];
  function nextPass(): Pass {
    if (queue.length === 0) {
      for (let pair = 0; pair < PAIRS_PER_BATCH; pair++) {
        const pass = run(randomNoise);
        queue.push(pass, mirror(pass));
      }
      shuffle(queue, random);
    }
    return queue.pop()!;
  }

  // Withdrawals from an ASK count as deposits first, so only what exceeds them is taxed. Tax is charged on
  // the nominal gain, which in today's money means the deposits lose value with inflation.
  function afterTaxAtEnd(index: number, value: number): number | undefined {
    const ask = accounts[index]?.ask;
    if (!ask) return undefined;
    const dailyLoss = (1 + ask.inflation) ** (-1 / DAYS_PER_YEAR);
    let deposits = accounts[index].startAmount;
    for (let day = startDays[index]; day < totalDays; day++) {
      for (const flow of flows) {
        if (flow.account === index && flow.fires[day]) deposits += flow.amount;
      }
      deposits *= dailyLoss;
    }
    return value - ask.taxRate * Math.max(0, value - deposits);
  }

  const pilots = Array.from({ length: PILOT_RUNS }, () => run(randomNoise));
  const seriesFor = entries.map((entry, index) => {
    const ends = pilots.map((pass) => pass[index][sampleDays.length - 1]).sort((a, b) => a - b);
    // The most extreme passes may leave the top of the graph, which keeps the rest of the fan readable.
    const highEnd = ends[Math.floor(ends.length * 0.95)];
    const expectedEnd = expected[index][sampleDays.length - 1];
    return {
      id: entry.id,
      name: entry.name,
      currency: entry.currency,
      calculated: index >= accounts.length,
      expected: expected[index],
      yMax: Math.max(highEnd, expectedEnd) * 1.05 || 1,
      afterTax: afterTaxAtEnd(index, expectedEnd),
    };
  });

  return { startMs, totalDays, sampleDays, accounts: seriesFor, nextPass };
}
