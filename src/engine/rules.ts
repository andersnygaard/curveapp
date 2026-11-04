// General rules. Each is one thing that can happen in a day.
import { OUTSIDE, type Rule } from './engine';
import { PENSION_TAX_RATE, shareLeaving, taxOnDraw } from './norway';
import { DAYS_PER_YEAR } from './timeline';

export function stepFactor(
  id: string,
  fires: Uint8Array,
  next: (value: number, day: number, shock: number) => number,
): Rule {
  return {
    phase: 'factors',
    fires,
    start(world) {
      const path = world.factor(id);
      const shock = world.noise(id);
      return (day) => {
        path.previous = path.value;
        path.value = next(path.value, day, shock());
      };
    },
  };
}

export function marketStep(volatility: number, gaps: Float64Array) {
  return (value: number, day: number, shock: number) => value * Math.exp(volatility * Math.sqrt(gaps[day]) * shock);
}

// Returns build up every day and are paid out when the market moves, so 4 % means 4 % a year on any interval.
export function earnReturn(
  stock: number,
  annualRate: number,
  market: string,
  paysOn: Uint8Array,
  everyDay: Uint8Array,
): Rule {
  const dailyRate = (1 + annualRate) ** (1 / DAYS_PER_YEAR) - 1;
  return {
    phase: 'growth',
    fires: everyDay,
    start(world) {
      const path = world.factor(market);
      let accrued = 0;
      return (day) => {
        accrued += (world.balances[stock] + accrued) * dailyRate;
        if (!paysOn[day]) return;
        world.grow(stock, accrued);
        world.grow(stock, world.balances[stock] * (path.value / path.previous - 1));
        accrued = 0;
      };
    },
  };
}

export interface Route {
  to: number;
  label: string;
  // A fixed part of each payment. Without it the route takes what is left.
  amount?: number;
  // The part of what is left that continues, when a budget keeps the rest.
  share?: (day: number) => number;
}

// A payment cannot be spent twice. Fixed routes go first, and what nobody takes is spent.
export function payIncome(amount: number, routes: Route[], fires: Uint8Array): Rule {
  const ordered = [...routes].sort((a, b) => Number(a.amount === undefined) - Number(b.amount === undefined));
  return {
    phase: 'income',
    fires,
    start(world) {
      return (day) => {
        let left = amount;
        for (const route of ordered) {
          const wanted = route.amount ?? left * (route.share?.(day) ?? 1);
          left -= world.move(OUTSIDE, route.to, Math.min(left, wanted), route.label);
        }
      };
    },
  };
}

export function moveBetween(
  from: number,
  to: number,
  amount: number,
  fires: Uint8Array,
  label: string,
  rank: number,
): Rule {
  return {
    phase: 'draw',
    rank,
    fires,
    start: (world) => () => {
      world.move(from, to, amount, label);
    },
  };
}

export interface PayoutOptions {
  stock: number;
  to: number;
  // The monthly payments that are left. Whatever is there goes out at once when none are.
  payments: number;
  annualRate: number;
  fires: Uint8Array;
  label: string;
}

// The amount is worked out once a year from what is left, so it follows the market and the account empties
// at the end, whatever the market did. Whatever comes in after that, such as return earned before, is passed on.
export function payOutOverYears({ stock, to, payments, annualRate, fires, label }: PayoutOptions): Rule {
  const rate = (1 + annualRate) ** (1 / 12) - 1;
  const perMonthOf = (balance: number, months: number) =>
    rate === 0 ? balance / months : (balance * rate) / (1 - (1 + rate) ** -months);
  return {
    phase: 'payout',
    fires,
    start(world) {
      let left = payments;
      let perMonth = 0;
      return () => {
        const balance = world.balances[stock];
        if (left > 1 && (left % 12 === 0 || perMonth === 0)) perMonth = perMonthOf(balance, left);
        world.notePayout(stock, world.move(stock, to, left > 1 ? Math.min(perMonth, balance) : balance, label));
        left--;
      };
    },
  };
}

export type Need = { perMonth: number } | { yearlyShareOfAccounts: number };

// The flows that say what a gate has needed, drawn from one account, passed on and not been able to pay.
export const neededBy = (gate: number) => `need:${gate}`;
export const drawnBy = (gate: number, stock: number) => `drawn:${gate}:${stock}`;
export const passedOnBy = (gate: number) => `surplus:${gate}`;
export const shortAt = (gate: number) => `short:${gate}`;
export const taxPaidAt = (gate: number) => `tax:${gate}`;

export interface Pull {
  stock: number;
  // 0 for an account without tax on its gain.
  taxOnGain: number;
}

export interface GateOptions {
  buffer: number;
  pulls: Pull[];
  overflow: number;
  need: Need;
  startDay: number;
  fires: Uint8Array;
  rank: number;
}

// What the gate received counts first, and tax on pension has already been paid from it. Any surplus flows on, and any
// shortfall is drawn from the accounts by size. An amount is what should be left after tax, so more is drawn to pay the tax.
// A share of the accounts is what is drawn, and the tax comes out of it. Before the start day there is no need, so pension
// paid early flows straight on.
export function settleGate({ buffer, pulls, overflow, need, startDay, fires, rank }: GateOptions): Rule {
  const afterTax = 'perMonth' in need;
  return {
    phase: 'draw',
    rank,
    fires,
    start(world) {
      const { balances, ledger } = world;
      const inAccounts = () => pulls.reduce((sum, { stock }) => sum + balances[stock], 0);
      const taxRate = world.factor(PENSION_TAX_RATE);
      let lockedNeed: number | undefined;
      return (day) => {
        // A share of the accounts waits until there is something in them, since they may not have opened yet.
        if (day >= startDay && lockedNeed === undefined) {
          if ('perMonth' in need) lockedNeed = need.perMonth;
          else if (inAccounts() > 0) lockedNeed = (need.yearlyShareOfAccounts * inAccounts()) / 12;
        }
        const perMonth = lockedNeed ?? 0;

        const received = balances[buffer];
        const wanted = afterTax ? perMonth : perMonth * (1 - taxRate.value);
        const covered = Math.min(received, wanted);
        world.move(buffer, OUTSIDE, covered, 'spent:pension');
        if (received > covered) world.tally(passedOnBy(buffer), world.move(buffer, overflow, received - covered, 'surplus'));

        const shortfall = afterTax ? perMonth - covered : perMonth * (wanted > 0 ? 1 - covered / wanted : 1);
        let drawn = 0;
        let unmet = 0;
        if (shortfall > 0) {
          const accounts = pulls.map(({ stock, taxOnGain }) => ({
            balance: balances[stock],
            // Shielding used earlier today is only taken off at the end of the day. Two gates on one account can
            // therefore both count on it, the one month it runs out.
            taxFree: ledger.deposits[stock] + ledger.shield[stock],
            taxOnGain,
          }));
          const available = inAccounts();
          const share = available <= 0 ? 0 : afterTax ? shareLeaving(accounts, shortfall) : Math.min(1, shortfall / available);
          let beforeTax = 0;
          pulls.forEach(({ stock }, index) => {
            const { balance, taxFree, taxOnGain } = accounts[index];
            const out = balance * share;
            const tax = taxOnDraw(out, taxFree, taxOnGain);
            const moved = world.move(stock, OUTSIDE, out - tax, 'spent:accounts');
            world.tally(drawnBy(buffer, stock), moved);
            world.tally(taxPaidAt(buffer), world.move(stock, OUTSIDE, tax, 'tax:gain'));
            drawn += moved;
            beforeTax += out;
          });
          const missing = shortfall - (afterTax ? drawn : beforeTax);
          if (missing > 0.005) {
            unmet = missing;
            world.record('unmet', unmet, buffer);
            world.tally(shortAt(buffer), unmet);
            ledger.short[buffer] += unmet;
            for (const { stock } of pulls) ledger.short[stock] += unmet;
          }
        }
        // A share of the accounts leaves whatever is left after tax, and that is what it has paid for.
        world.tally(neededBy(buffer), afterTax ? perMonth : covered + drawn + unmet);
      };
    },
  };
}

// Tax is charged on the nominal gain, which in today's money means that what was put in loses value with inflation.
export function deflateDeposits(stock: number, annualInflation: number, fires: Uint8Array): Rule {
  const dailyLoss = (1 + annualInflation) ** (-1 / DAYS_PER_YEAR);
  return {
    phase: 'close',
    fires,
    start: (world) => () => {
      world.ledger.deposits[stock] *= dailyLoss;
    },
  };
}
