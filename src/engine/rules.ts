// General rules. Each is one thing that can happen in a day.
import { OUTSIDE, ROUNDING, type Rule, type World } from './engine';
import { beforeDrawing, drawShare, PENSION_TAX_RATE, shareLeaving, type TaxedAccount } from './norway';
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

// Returns build up every day and are paid out when the market moves, so 4 % means 4 % a year on any interval. The market
// steps have no drift, so the rate given is the median, or geometric, rate, and the mean ends about half the variance higher.
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

// A payment from a stock that pays out, named by the id of the stock it was paid from.
const PAYOUT = 'payout:';
export const payoutOf = (stockId: string) => `${PAYOUT}${stockId}`;
export const payoutSource = (label: string) => (label.startsWith(PAYOUT) ? label.slice(PAYOUT.length) : null);

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

// What happens to money at a gate. The plan reads these, so they are part of what the engine says. What the gate spent of
// what it received can be pension or income wired straight to it, since the gate cannot tell the two apart.
export const SPENT_PENSION = 'spent:pension';
export const SPENT_ACCOUNTS = 'spent:accounts';
export const TAX_ON_GAIN = 'tax:gain';
export const SURPLUS = 'surplus';
export const UNMET = 'unmet';

// The flows that say what a gate has needed, drawn from one account, passed on, not been able to pay and paid in tax.
// They are only added up for the charts and never recorded, so the plan does not see them.
export const needAt = (gate: number) => `need:${gate}`;
export const drawnAt = (gate: number, stock: number) => `drawn:${gate}:${stock}`;
export const surplusAt = (gate: number) => `surplus:${gate}`;
export const shortAt = (gate: number) => `short:${gate}`;
export const taxAt = (gate: number) => `tax:${gate}`;

// The flows a gate adds to, named once when the rule is made and not each time it runs.
const gateFlows = (gate: number, accounts: TaxedAccount[]) => ({
  need: needAt(gate),
  drawn: accounts.map(({ stock }) => drawnAt(gate, stock)),
  surplus: surplusAt(gate),
  short: shortAt(gate),
  tax: taxAt(gate),
});

export interface GateOptions {
  gate: number;
  // The accounts it draws from when what it received is not enough.
  accounts: TaxedAccount[];
  // Where what is left over goes, or OUTSIDE when it counts as spent.
  surplusTo: number;
  need: Need;
  startDay: number;
  fires: Uint8Array;
  rank: number;
}

// What the accounts hold together.
const heldIn = ({ balances }: World, accounts: TaxedAccount[]) =>
  accounts.reduce((sum, { stock }) => sum + balances[stock], 0);

// The need in kroner a month. There is none before the start day. A share of the accounts waits until there is something
// in them, since they may not have opened yet, and is then the same amount every month.
function lockedNeed(need: Need, startDay: number, inAccounts: () => number): (day: number) => number {
  let locked: number | undefined;
  return (day) => {
    if (day >= startDay && locked === undefined) {
      if ('perMonth' in need) locked = need.perMonth;
      else if (inAccounts() > 0) locked = (need.yearlyShareOfAccounts * inAccounts()) / 12;
    }
    return locked ?? 0;
  };
}

// What the gate received pays for what is wanted, and the rest flows on. Returns what it covered.
function spendReceived(world: World, gate: number, surplusTo: number, wanted: number, surplusFlow: string): number {
  const received = world.balances[gate];
  const covered = Math.min(received, wanted);
  world.move(gate, OUTSIDE, covered, SPENT_PENSION);
  if (received > covered) world.tally(surplusFlow, world.move(gate, surplusTo, received - covered, SURPLUS));
  return covered;
}

// What the gate received counts first, and tax on pension has already been paid from it. Any surplus flows on, and any
// shortfall is drawn from the accounts by size. An amount is what should be left after tax, so more is drawn to pay the tax.
// A share of the accounts is what is drawn, and the tax comes out of it. Before the start day there is no need, so pension
// paid early flows straight on.
export function settleGate({ gate, accounts, surplusTo, need, startDay, fires, rank }: GateOptions): Rule {
  const afterTax = 'perMonth' in need;
  const flows = gateFlows(gate, accounts);
  return {
    phase: 'draw',
    rank,
    fires,
    start(world) {
      const needOn = lockedNeed(need, startDay, () => heldIn(world, accounts));
      const pensionTax = world.factor(PENSION_TAX_RATE);
      const fallsShortOn = [gate, ...accounts.map(({ stock }) => stock)];
      return (day) => {
        const perMonth = needOn(day);
        // An amount is after tax. A share is before tax, so the tax on pension comes off it before what was received counts.
        const wanted = afterTax ? perMonth : perMonth * (1 - pensionTax.value);
        const covered = spendReceived(world, gate, surplusTo, wanted, flows.surplus);
        const shortfall = afterTax ? perMonth - covered : perMonth * (wanted > 0 ? 1 - covered / wanted : 1);
        let drawn = 0;
        let unmet = 0;
        if (shortfall > 0) {
          const held = beforeDrawing(world, accounts);
          const available = heldIn(world, accounts);
          const share = available <= 0 ? 0 : afterTax ? shareLeaving(held, shortfall) : Math.min(1, shortfall / available);
          const paid = drawShare(world, accounts, held, share, SPENT_ACCOUNTS, TAX_ON_GAIN, (index, spent, tax) => {
            world.tally(flows.drawn[index], spent);
            world.tally(flows.tax, tax);
          });
          drawn = paid.left;
          const missing = shortfall - (afterTax ? paid.left : paid.beforeTax);
          if (missing > ROUNDING) {
            unmet = missing;
            world.fallShort(UNMET, unmet, fallsShortOn, gate);
            world.tally(flows.short, unmet);
          }
        }
        // A share of the accounts leaves whatever is left after tax, and that is what it has paid for.
        world.tally(flows.need, afterTax ? perMonth : covered + drawn + unmet);
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
