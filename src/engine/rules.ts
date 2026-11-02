// General rules. Each is one thing that can happen in a day.
import { OUTSIDE, type Rule } from './engine';
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

export interface GateOptions {
  buffer: number;
  pulls: number[];
  overflow: number;
  need: Need;
  startDay: number;
  fires: Uint8Array;
  rank: number;
}

// What the gate received counts first. Any surplus flows on, and any shortfall is drawn from the accounts by
// size. Before the start day there is no need, so pension paid early flows straight on.
export function settleGate({ buffer, pulls, overflow, need, startDay, fires, rank }: GateOptions): Rule {
  return {
    phase: 'draw',
    rank,
    fires,
    start(world) {
      const inAccounts = () => pulls.reduce((sum, stock) => sum + world.balances[stock], 0);
      let lockedNeed: number | undefined;
      return (day) => {
        // A share of the accounts waits until there is something in them, since they may not have opened yet.
        if (day >= startDay && lockedNeed === undefined) {
          if ('perMonth' in need) lockedNeed = need.perMonth;
          else if (inAccounts() > 0) lockedNeed = (need.yearlyShareOfAccounts * inAccounts()) / 12;
        }
        const perMonth = lockedNeed ?? 0;
        const received = world.balances[buffer];
        const covered = Math.min(received, perMonth);
        world.move(buffer, OUTSIDE, covered, 'spent:pension');
        if (received > covered) world.move(buffer, overflow, received - covered, 'surplus');

        const shortfall = perMonth - covered;
        if (shortfall <= 0) return;
        const available = inAccounts();
        const share = available > 0 ? Math.min(1, shortfall / available) : 0;
        let drawn = 0;
        for (const stock of pulls) drawn += world.move(stock, OUTSIDE, world.balances[stock] * share, 'spent:accounts');

        const unmet = shortfall - drawn;
        if (unmet <= 0.005) return;
        world.record('unmet', unmet);
        world.ledger.short[buffer] += unmet;
        for (const stock of pulls) world.ledger.short[stock] += unmet;
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
