// Norwegian pension rules, as plain formulas and rules on top of the general engine. All the law lives here.
import { OUTSIDE, type Rule } from './engine';
import { DAYS_PER_YEAR } from './timeline';

export const G = 'g';
export const G_REGULATION_DATE = { month: 4, day: 1 };
export const SHIELD_DATE = { month: 11, day: 31 };

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
  // When the balance becomes a pension. What has been earned by then is part of it.
  closeDay?: number;
  fires: Uint8Array;
}

// Earnings reach the balance at the end of the following year, so the first year end adds last year's.
export function earnFolketrygd(options: EarningsOptions): Rule {
  const { stock, openDay, regulatedThisYear, salary, baseG, growth, yearEnd, closeDay, fires } = options;
  return {
    phase: 'adjust',
    fires,
    start(world) {
      const g = world.factor(G);
      let pending = 0;
      return (day) => {
        if (day === openDay) {
          pending = regulatedThisYear
            ? earnings(salary(day - 1), g.previous / (1 + growth), g.previous, baseG)
            : earnings(salary(day - 1), g.previous, g.value, baseG);
        }
        if (!yearEnd[day] && day !== closeDay) return;
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
    phase: 'income',
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
    phase: 'payout',
    fires,
    start(world) {
      let perMonth: number | undefined;
      return () => {
        perMonth ??= world.balances[stock] / divisor / 12;
        world.notePayout(stock, world.move(OUTSIDE, to, perMonth, label));
      };
    },
  };
}

// The rates adopted for 2026, from regjeringen.no and Skatteetaten. They stay fixed, since all amounts are in today's money.
const PENSION_TAX = {
  minimumDeductionShare: 0.4,
  minimumDeductionMost: 75_400,
  personalAllowance: 114_540,
  ordinaryIncomeRate: 0.22,
  socialRate: 0.051,
  socialFrom: 99_650,
  socialMostOfWhatIsAbove: 0.25,
  brackets: [
    { from: 226_100, rate: 0.017 },
    { from: 318_300, rate: 0.04 },
    { from: 725_050, rate: 0.137 },
    { from: 980_100, rate: 0.168 },
    { from: 1_467_200, rate: 0.178 },
  ],
  credit: 39_100,
  creditShrinks: [
    { from: 294_200, rate: 0.191 },
    { from: 437_100, rate: 0.06 },
  ],
};

const above = (amount: number, from: number) => Math.max(0, amount - from);

// Each rate counts only for the part of the amount between where it starts and where the next one takes over.
const throughBands = (amount: number, bands: { from: number; rate: number }[]) =>
  bands.reduce((sum, { from, rate }, index) => {
    const upTo = bands[index + 1]?.from ?? Infinity;
    return sum + (Math.min(amount, upTo) - Math.min(amount, from)) * rate;
  }, 0);

// A year's tax on a year's pension and nothing else. The credit comes off all of it, and cannot take the tax below nothing.
export function taxOnPension(perYear: number, hasCredit: boolean): number {
  const { minimumDeductionShare, minimumDeductionMost, personalAllowance, ordinaryIncomeRate, socialRate } = PENSION_TAX;
  const minimumDeduction = Math.min(perYear * minimumDeductionShare, minimumDeductionMost);
  const ordinary = above(perYear, minimumDeduction + personalAllowance) * ordinaryIncomeRate;
  const social = Math.min(perYear * socialRate, above(perYear, PENSION_TAX.socialFrom) * PENSION_TAX.socialMostOfWhatIsAbove);
  const bracket = throughBands(perYear, PENSION_TAX.brackets);
  const credit = hasCredit ? Math.max(0, PENSION_TAX.credit - throughBands(perYear, PENSION_TAX.creditShrinks)) : 0;
  return Math.max(0, ordinary + social + bracket - credit);
}

// The share of this month's pension that goes to tax, for the rules that need to know how much of it is left.
export const PENSION_TAX_RATE = 'pensionTaxRate';

// What is left of a pension's payments after tax.
export const keptOf = (label: string) => `kept:${label}`;

export interface TaxedPension {
  // The flow its payments are recorded under.
  label: string;
  to: number;
  // Where the tax is added up, if anything is to show it.
  taxShownAs?: string;
  // Only the old-age pension gives the credit, but all pensions count when the credit shrinks.
  givesCredit: boolean;
}

// The tax is per person, so it is worked out on all pensions together, as if this month's pay lasted the whole year. Each
// pension then pays its part where its money went. Money that has left the model has no tax to take, but it still counts.
export function taxPensions(pensions: TaxedPension[], yearOf: (day: number) => number, fires: Uint8Array): Rule {
  return {
    phase: 'payout',
    rank: 1,
    fires,
    start(world) {
      const taxRate = world.factor(PENSION_TAX_RATE);
      const seen = new Float64Array(pensions.length);
      const paid = new Float64Array(pensions.length);
      let seenYear = -1;
      return (day) => {
        const year = yearOf(day);
        if (year !== seenYear) seen.fill(0);
        seenYear = year;
        let perMonth = 0;
        let hasCredit = false;
        pensions.forEach(({ label, givesCredit }, index) => {
          const thisYear = world.ledger.flows.get(label)?.[year] ?? 0;
          paid[index] = thisYear - seen[index];
          seen[index] = thisYear;
          perMonth += paid[index];
          hasCredit ||= givesCredit && paid[index] > 0;
        });
        const rate = perMonth > 0 ? taxOnPension(perMonth * 12, hasCredit) / (perMonth * 12) : 0;
        taxRate.value = rate;
        pensions.forEach(({ label, to, taxShownAs }, index) => {
          world.tally(keptOf(label), paid[index] * (1 - rate));
          if (to === OUTSIDE) return;
          const tax = world.move(to, OUTSIDE, paid[index] * rate, 'tax:pension');
          if (taxShownAs) world.tally(taxShownAs, tax);
        });
      };
    },
  };
}

// The real divisors are set when a birth cohort turns 61. Until then this is an estimate the user can overrule.
export function estimatedDivisor(age: number): number {
  return Math.max(1, 85 - age);
}

export interface DrawnAccount {
  balance: number;
  // What can be drawn before any of it counts as a gain.
  taxFree: number;
  taxOnGain: number;
}

// A withdrawal from an aksjesparekonto counts as deposits first and then as shielding, and only what goes beyond them is
// a gain. So the first withdrawals are free of tax, and the tax comes later.
export const taxOnDraw = (drawn: number, taxFree: number, taxOnGain: number) => taxOnGain * Math.max(0, drawn - taxFree);

// The share of every account to draw so that what is left after tax is the amount asked for, or 1 if they cannot pay
// it. What is left grows in a straight line until an account starts to pay tax, so the answer is found without guessing.
export function shareLeaving(accounts: DrawnAccount[], amount: number): number {
  const taxStarts = accounts
    .filter(({ balance, taxOnGain }) => balance > 0 && taxOnGain > 0)
    .map(({ balance, taxFree, taxOnGain }) => ({ at: taxFree / balance, slowsBy: taxOnGain * balance }))
    .filter(({ at }) => at < 1)
    .sort((a, b) => a.at - b.at);
  let growth = accounts.reduce((sum, { balance }) => sum + balance, 0);
  let share = 0;
  let left = 0;
  for (const { at, slowsBy } of taxStarts) {
    const leftThere = left + growth * (at - share);
    if (leftThere >= amount) break;
    left = leftThere;
    share = at;
    growth -= slowsBy;
  }
  return growth > 0 ? Math.min(1, share + (amount - left) / growth) : 1;
}

interface ShieldOptions {
  stock: number;
  annualRate: number;
  annualInflation: number;
  // What is unused from before the account's first day in the simulation.
  opening: number;
  yearEnds: Uint8Array;
  fires: Uint8Array;
}

// Skjermingsfradrag on an aksjesparekonto. Each 31 December the lowest deposit balance of the year and the unused
// shielding earn the rate, and what is not used carries over. A withdrawal counts as deposits first, so only what goes
// beyond the deposits uses it up. The rate works on the kroner of the day, while the ledger is in today's money, so
// the shielding loses value with inflation like the deposits do. It moves no money, and only lowers the taxable gain.
export function earnShield({ stock, annualRate, annualInflation, opening, yearEnds, fires }: ShieldOptions): Rule {
  const dailyLoss = (1 + annualInflation) ** (-1 / DAYS_PER_YEAR);
  return {
    phase: 'close',
    // Before the deposits lose the value of this day, which the same inflation takes from them right after.
    rank: -1,
    fires,
    start(world) {
      const { ledger, isOpen } = world;
      let opened = false;
      let priceLevel = 1;
      let lowest = Infinity;
      let depositsBefore = 0;
      let inBefore = 0;
      let outBefore = 0;
      return (day) => {
        if (!isOpen[stock]) return;
        const deposits = ledger.deposits[stock];
        if (!opened) {
          opened = true;
          ledger.shield[stock] = opening;
        } else {
          const fromDeposits = depositsBefore + ledger.in[stock] - inBefore - deposits;
          const beyondDeposits = Math.max(0, ledger.out[stock] - outBefore - fromDeposits);
          ledger.shield[stock] = Math.max(0, ledger.shield[stock] - beyondDeposits);
        }
        lowest = Math.min(lowest, deposits * priceLevel);
        if (yearEnds[day]) {
          ledger.shield[stock] += (lowest / priceLevel + ledger.shield[stock]) * annualRate;
          lowest = deposits * priceLevel;
        }
        ledger.shield[stock] *= dailyLoss;
        priceLevel /= dailyLoss;
        depositsBefore = deposits * dailyLoss;
        inBefore = ledger.in[stock];
        outBefore = ledger.out[stock];
      };
    },
  };
}

export const WEALTH_DATE = { month: 11, day: 31 };

// What the wealth tax takes, what it costs in tax on gains to pay it, and what the accounts could not pay.
export const WEALTH_TAX = 'wealth:tax';
export const WEALTH_TAX_GAIN = 'wealth:gain';
export const WEALTH_TAX_SHORT = 'wealth:short';

export type HomeKind = 'primary' | 'secondary' | 'cabin';

// The shares and limits for 2026, from Skatteetaten. An account that may hold shares counts as if it does.
const SHARES_COUNT = 0.8;
const HOME_COUNTS: Record<HomeKind, { from: number; rate: number }[]> = {
  primary: [
    { from: 0, rate: 0.25 },
    { from: 14_000_000, rate: 0.7 },
  ],
  secondary: [{ from: 0, rate: 1 }],
  // The most a cabin can count. An older one can count for less, so the tax is too high rather than too low.
  cabin: [{ from: 0, rate: 0.3 }],
};

export interface Home {
  kind: HomeKind;
  value: number;
  loan: number;
}

export interface Wealth {
  // What may hold shares, and what is counted in full.
  funds: number;
  cash: number;
  homes: Home[];
}

// Loans are shared out by what everything is worth, and the part that falls on shares only comes off with their discount.
export function taxableWealth({ funds, cash, homes }: Wealth): number {
  const worth = homes.reduce((sum, { value }) => sum + value, funds + cash);
  const counted = homes.reduce((sum, { kind, value }) => sum + throughBands(value, HOME_COUNTS[kind]), funds * SHARES_COUNT + cash);
  const loans = homes.reduce((sum, { loan }) => sum + loan, 0);
  const deducted = worth > 0 ? loans * (1 - (funds / worth) * (1 - SHARES_COUNT)) : loans;
  return Math.max(0, counted - deducted);
}

export interface WealthRates {
  allowance: number;
  rate: number;
  highFrom: number;
  highRate: number;
}

export const taxOnWealth = (wealth: number, { allowance, rate, highFrom, highRate }: WealthRates) =>
  throughBands(wealth, [
    { from: allowance, rate },
    { from: Math.max(allowance, highFrom), rate: highRate },
  ]);

export interface WealthTaxOptions {
  rates: WealthRates;
  accounts: { stock: number; holdsFunds: boolean; taxOnGain: number }[];
  homes: { kind: HomeKind; value: number; loanOn: (day: number) => number }[];
  fires: Uint8Array;
}

// Worked out once a year from what each pass holds that day, and taken from the accounts by size, with the same tax on gains
// as a withdrawal. A home counts but cannot pay, so the accounts can fall short. What is missing stays unpaid and is no debt.
export function payWealthTax({ rates, accounts, homes, fires }: WealthTaxOptions): Rule {
  return {
    phase: 'draw',
    // After everything else that draws today, so it counts what is really left.
    rank: Infinity,
    fires,
    start(world) {
      const { balances, ledger } = world;
      const held = (holdsFunds: boolean) =>
        accounts.reduce((sum, account) => sum + (account.holdsFunds === holdsFunds ? balances[account.stock] : 0), 0);
      return (day) => {
        const tax = taxOnWealth(
          taxableWealth({
            funds: held(true),
            cash: held(false),
            homes: homes.map(({ kind, value, loanOn }) => ({ kind, value, loan: loanOn(day) })),
          }),
          rates,
        );
        if (tax <= 0) return;
        const drawn = accounts.map(({ stock, taxOnGain }) => ({
          balance: balances[stock],
          taxFree: ledger.deposits[stock] + ledger.shield[stock],
          taxOnGain,
        }));
        const share = shareLeaving(drawn, tax);
        let paid = 0;
        accounts.forEach(({ stock }, index) => {
          const { balance, taxFree, taxOnGain } = drawn[index];
          const out = balance * share;
          const onGain = taxOnDraw(out, taxFree, taxOnGain);
          paid += world.move(stock, OUTSIDE, out - onGain, WEALTH_TAX);
          world.move(stock, OUTSIDE, onGain, WEALTH_TAX_GAIN);
        });
        const missing = tax - paid;
        if (missing <= 0.005) return;
        world.record(WEALTH_TAX_SHORT, missing);
        for (const { stock } of accounts) ledger.short[stock] += missing;
      };
    },
  };
}
