// The engine knows about stocks, factors and rules. It knows nothing about salaries, pensions, boxes or the screen.
import type { NoiseSource } from './random';
import type { Timeline } from './timeline';

// Money coming into or leaving the model.
export const OUTSIDE = -1;

// The order of a day. Money arrives before anything is drawn, so the order of the boxes on the canvas never matters.
export type Phase = 'factors' | 'adjust' | 'growth' | 'income' | 'payout' | 'draw' | 'close';
const PHASES: Phase[] = ['factors', 'adjust', 'growth', 'income', 'payout', 'draw', 'close'];

export interface Stock {
  id: string;
  name: string;
  unit: 'money' | 'notional';
  currency: string;
  opening: number;
  openDay: number;
  // The balance has no meaning after this day, so it is not drawn.
  closeDay?: number;
  // Holds money on its way somewhere and gets no graph.
  hidden?: boolean;
  // A rule draws from it and can ask for more than there is.
  canRunOut?: boolean;
  taxOnGain?: number;
}

export interface Factor {
  id: string;
  value: number;
  previous: number;
}

export interface Rule {
  phase: Phase;
  // Within a phase, lower ranks go first. A rule that draws from an account runs after the rules that fill it.
  rank?: number;
  fires: Uint8Array;
  // Called once per pass, so a rule can keep its own state in the closure.
  start(world: World): (day: number) => void;
}

export interface Model {
  timeline: Timeline;
  stocks: Stock[];
  factors: Factor[];
  rules: Rule[];
  sampleDays: number[];
  // Indexes of the stocks that get a graph, in the order they are shown.
  charted: number[];
  // False when nothing in the model is random, so one pass says it all.
  random: boolean;
}

export interface Ledger {
  in: Float64Array;
  out: Float64Array;
  growth: Float64Array;
  // What was asked for and could not be paid.
  short: Float64Array;
  // What is left of what was put in. A withdrawal counts as deposits first.
  deposits: Float64Array;
  // The first regular payment from each stock.
  firstPayout: Float64Array;
  // Money per label and calendar year.
  flows: Map<string, Float64Array>;
}

export class World {
  readonly balances: Float64Array;
  readonly isOpen: Uint8Array;
  readonly ledger: Ledger;
  readonly noise: NoiseSource;
  day = 0;
  private readonly model: Model;
  private readonly paths = new Map<string, { value: number; previous: number }>();

  constructor(model: Model, noise: NoiseSource) {
    const count = model.stocks.length;
    this.model = model;
    this.noise = noise;
    this.balances = new Float64Array(count);
    this.isOpen = new Uint8Array(count);
    this.ledger = {
      in: new Float64Array(count),
      out: new Float64Array(count),
      growth: new Float64Array(count),
      short: new Float64Array(count),
      deposits: new Float64Array(count),
      firstPayout: new Float64Array(count),
      flows: new Map(),
    };
    for (const { id, value, previous } of model.factors) this.paths.set(id, { value, previous });
  }

  factor(id: string) {
    return this.paths.get(id)!;
  }

  open(stock: number) {
    this.isOpen[stock] = 1;
    this.balances[stock] = this.model.stocks[stock].opening;
    this.ledger.deposits[stock] = this.model.stocks[stock].opening;
  }

  // Every krone that moves goes through here, so money cannot appear or vanish unnoticed. Returns what was moved.
  move(from: number, to: number, amount: number, label: string): number {
    if (to !== OUTSIDE && !this.isOpen[to]) return 0;
    if (from !== OUTSIDE && !this.isOpen[from]) return 0;
    const moved = from === OUTSIDE ? amount : Math.min(amount, this.balances[from]);
    if (from !== OUTSIDE && moved < amount) this.ledger.short[from] += amount - moved;
    if (moved <= 0) return 0;
    if (from !== OUTSIDE) {
      this.balances[from] -= moved;
      this.ledger.out[from] += moved;
      this.ledger.deposits[from] = Math.max(0, this.ledger.deposits[from] - moved);
    }
    if (to !== OUTSIDE) {
      this.balances[to] += moved;
      this.ledger.in[to] += moved;
      this.ledger.deposits[to] += moved;
    }
    this.record(label, moved);
    return moved;
  }

  // Value that changes without moving money: returns and the regulation of a calculated balance. A loss can take
  // a balance to 0 and no further.
  grow(stock: number, amount: number) {
    const applied = Math.max(amount, -this.balances[stock]);
    this.balances[stock] += applied;
    this.ledger.growth[stock] += applied;
  }

  notePayout(stock: number, amount: number) {
    if (amount > 0 && this.ledger.firstPayout[stock] === 0) this.ledger.firstPayout[stock] = amount;
  }

  record(label: string, amount: number) {
    let flow = this.ledger.flows.get(label);
    if (!flow) {
      flow = new Float64Array(this.model.timeline.yearIndex(this.model.timeline.days) + 1);
      this.ledger.flows.set(label, flow);
    }
    flow[this.model.timeline.yearIndex(this.day)] += amount;
  }
}

export interface PassResult {
  // One series per charted stock, one value per sample. NaN where the stock does not exist.
  series: Float64Array[];
  ledger: Ledger;
  closing: Float64Array;
  // Deposits at the last sample, measured at the same moment as the balance.
  depositsAtEnd: Float64Array;
}

export function orderRules(rules: Rule[]): Rule[] {
  return PHASES.flatMap((phase) =>
    rules.filter((rule) => rule.phase === phase).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
  );
}

export function runPass(model: Model, noise: NoiseSource): PassResult {
  const { stocks, sampleDays, timeline, charted } = model;
  const world = new World(model, noise);
  const rules = model.rules.map((rule) => ({ fires: rule.fires, fire: rule.start(world) }));
  const series = charted.map(() => new Float64Array(sampleDays.length).fill(NaN));
  const depositsAtEnd = new Float64Array(stocks.length);
  let nextSample = 0;

  for (let day = 0; day <= timeline.days; day++) {
    world.day = day;
    for (let stock = 0; stock < stocks.length; stock++) {
      if (stocks[stock].openDay === day) world.open(stock);
    }
    if (sampleDays[nextSample] === day) {
      charted.forEach((stock, index) => {
        // The line goes one sample past the close, so it ends on the balance the stock closed with.
        const closed = nextSample > 0 && sampleDays[nextSample - 1] > (stocks[stock].closeDay ?? Infinity);
        if (world.isOpen[stock] && !closed) series[index][nextSample] = world.balances[stock];
      });
      if (nextSample === sampleDays.length - 1) depositsAtEnd.set(world.ledger.deposits);
      nextSample++;
    }
    for (const rule of rules) {
      if (rule.fires[day]) rule.fire(day);
    }
  }
  return { series, ledger: world.ledger, closing: world.balances, depositsAtEnd };
}
