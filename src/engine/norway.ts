// Norwegian pension rules, as plain formulas and rules on top of the general engine. All the law lives here.
import { OUTSIDE, type Rule } from './engine';

export const G = 'g';
export const G_REGULATION_DATE = { month: 4, day: 1 };

const PENSION_RATE = 0.181;
const PENSION_CAP_IN_G = 7.1;
const SAVINGS_LOW_CAP_IN_G = 7.1;
const SAVINGS_HIGH_CAP_IN_G = 12;
const LOWEST_G_GROWTH = -0.9;

export function nextG(growth: number, volatility: number) {
  return (value: number, _day: number, shock: number) =>
    value * (1 + Math.max(LOWEST_G_GROWTH, growth + volatility * shock));
}

// Salary follows G, so it keeps its place relative to the caps.
const salaryAt = (salary: number, g: number, baseG: number) => (salary * g) / baseG;

// A year's earnings use the average G: four months at last year's G and eight at this year's.
function earnings(salary: number, previousG: number, g: number, baseG: number): number {
  const averageG = (4 * previousG + 8 * g) / 12;
  return PENSION_RATE * Math.min(salaryAt(salary, g, baseG), PENSION_CAP_IN_G * averageG);
}

export function regulateWithG(stock: number, openDay: number, fires: Uint8Array): Rule {
  return {
    phase: 'adjust',
    fires,
    start(world) {
      const g = world.factor(G);
      return (day) => {
        if (day > openDay) world.grow(stock, world.balances[stock] * (g.value / g.previous - 1));
      };
    },
  };
}

export interface EarningsOptions {
  stock: number;
  openDay: number;
  regulatedThisYear: boolean;
  salary: (day: number) => number;
  baseG: number;
  growth: number;
  yearEnd: Uint8Array;
  fires: Uint8Array;
}

// Earnings reach the balance at the end of the following year, so the first year end adds last year's.
export function earnFolketrygd(options: EarningsOptions): Rule {
  const { stock, openDay, regulatedThisYear, salary, baseG, growth, yearEnd, fires } = options;
  return {
    phase: 'adjust',
    fires,
    start(world) {
      const g = world.factor(G);
      let pending = 0;
      return (day) => {
        if (day === openDay) {
          pending = regulatedThisYear
            ? earnings(salary(day), g.previous / (1 + growth), g.previous, baseG)
            : earnings(salary(day), g.previous, g.value, baseG);
        }
        if (!yearEnd[day]) return;
        world.grow(stock, pending);
        pending = earnings(salary(day), g.previous, g.value, baseG);
      };
    },
  };
}

export interface DepositOptions {
  stock: number;
  lowRate: number;
  highRate: number;
  salary: (day: number) => number;
  // The part of the year's savings that one payment of this income deposits.
  share: (day: number) => number;
  baseG: number;
  fires: Uint8Array;
}

// Each payment of an income deposits its share of the year's savings. The employer pays, so salary is untouched.
export function otpDeposit({ stock, lowRate, highRate, salary, share, baseG, fires }: DepositOptions): Rule {
  return {
    phase: 'money',
    fires,
    start(world) {
      const g = world.factor(G);
      return (day) => {
        const pay = salaryAt(salary(day), g.value, baseG);
        const low = Math.min(pay, SAVINGS_LOW_CAP_IN_G * g.value);
        const upToHighCap = Math.min(pay, SAVINGS_HIGH_CAP_IN_G * g.value);
        world.move(OUTSIDE, stock, (lowRate * low + highRate * (upToHighCap - low)) * share(day), 'otp:deposit');
      };
    },
  };
}

// The calculated balance is not money. From the first payment it turns into a fixed yearly pension in today's money.
export function payFolketrygd(stock: number, to: number, divisor: number, fires: Uint8Array, label: string): Rule {
  return {
    phase: 'money',
    fires,
    start(world) {
      let perMonth: number | undefined;
      return () => {
        perMonth ??= world.balances[stock] / divisor / 12;
        world.move(OUTSIDE, to, perMonth, label);
      };
    },
  };
}

// The real divisors are set when a birth cohort turns 61. Until then this is an estimate the user can overrule.
export function estimatedDivisor(age: number): number {
  return Math.max(1, 85 - age);
}
