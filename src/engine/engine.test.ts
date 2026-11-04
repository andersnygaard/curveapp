import { describe, expect, it } from 'vitest';
import { shareLeaving, taxOnDraw } from './norway';
import { OUTSIDE, runPass, World, type Model, type Stock } from './engine';
import { moveBetween } from './rules';
import { noNoise, passNoise } from './random';
import { summarize } from './statistics';
import { DAY_MS, Timeline, yearsSinceLast } from './timeline';

const START = Date.UTC(2027, 0, 1);

function modelOf(stocks: Stock[], timeline = new Timeline(START, 730), rules: Model['rules'] = []): Model {
  return {
    timeline,
    stocks,
    factors: [],
    rules,
    sampleDays: [0, 100, 200, 400, 730],
    charted: stocks.flatMap((stock, index) => (stock.hidden ? [] : [index])),
    gateSources: [],
    random: false,
  };
}

const stock = (id: string, extra: Partial<Stock> = {}): Stock => ({
  id,
  name: id,
  unit: 'money',
  currency: 'NOK',
  opening: 1000,
  openDay: 0,
  ...extra,
});

const count = (fires: Uint8Array) => fires.reduce((sum, value) => sum + value, 0);

describe('the share of the accounts that leaves an amount after tax', () => {
  const account = (balance: number, taxFree = balance, taxOnGain = 0) => ({ balance, taxFree, taxOnGain });

  it('is the plain share when nothing is taxed', () => {
    expect(shareLeaving([account(1_000), account(3_000)], 1_000)).toBe(0.25);
  });

  it('stays the plain share until the tax starts', () => {
    expect(shareLeaving([account(1_000, 500, 0.5)], 500)).toBe(0.5);
  });

  it('draws more once the tax has started', () => {
    // 500 is free. The next 100 needs 200 before tax.
    expect(shareLeaving([account(1_000, 500, 0.5)], 600)).toBeCloseTo(0.7, 10);
  });

  it('works through accounts that start to pay tax at different points', () => {
    const accounts = [account(1_000, 200, 0.5), account(1_000, 600, 0.25)];
    const share = shareLeaving(accounts, 1_000);
    const left = accounts.reduce((sum, { balance, taxFree, taxOnGain }) => {
      const out = balance * share;
      return sum + out - taxOnDraw(out, taxFree, taxOnGain);
    }, 0);
    expect(left).toBeCloseTo(1_000, 8);
  });

  it('is everything when they cannot pay it', () => {
    expect(shareLeaving([account(1_000, 0, 0.5)], 600)).toBe(1);
  });

  it('copes with an empty account and with tax that takes it all', () => {
    expect(shareLeaving([account(0, 0, 0.5), account(1_000)], 500)).toBe(0.5);
    expect(shareLeaving([account(1_000, 0, 1)], 500)).toBe(1);
  });
});

describe('Observing a pass', () => {
  const fires = new Timeline(START, 730).fires({ every: 'monthly' });
  const model = modelOf([stock('a'), stock('b')], new Timeline(START, 730), [moveBetween(0, 1, 10, fires, 'x', 0)]);

  it('tells where each amount came from and went', () => {
    const seen: unknown[] = [];
    runPass(model, noNoise, (recorded) => seen.push(recorded));
    expect(seen).toHaveLength(24);
    expect(seen[0]).toEqual({ day: 0, from: 0, to: 1, amount: 10, label: 'x' });
  });

  it('changes nothing in the result', () => {
    const watched = runPass(model, noNoise, () => {});
    expect(watched.closing).toEqual(runPass(model, noNoise).closing);
  });
});

describe('Timeline', () => {
  const timeline = new Timeline(START, 365);

  it('fires on the first of the month, or on the last day when paid at the end of the period', () => {
    const first = timeline.fires({ every: 'monthly' });
    expect(count(first)).toBe(13);
    expect(first[0]).toBe(1);
    const last = timeline.fires({ every: 'monthly', at: 'periodEnd' });
    expect(count(last)).toBe(12);
    expect(last[30]).toBe(1);
  });

  it('respects from and until, so start and end ages need no special handling', () => {
    expect(count(timeline.fires({ every: 'daily', from: 10, until: 20 }))).toBe(10);
    expect(count(timeline.fires({ every: 'daily', until: -5 }))).toBe(0);
    expect(count(timeline.fires({ every: 'yearly', from: -100 }))).toBe(2);
  });

  it('knows trading days, one-off events and dates in the year', () => {
    expect(count(timeline.fires({ every: 'tradingDays' }))).toBe(261);
    expect(count(timeline.fires({ once: 100 }))).toBe(1);
    expect(count(timeline.fires({ annually: { month: 4, day: 1 } }))).toBe(1);
  });

  it('counts calendar years from the start', () => {
    const midYear = new Timeline(Date.UTC(2027, 10, 1), 400);
    expect(midYear.yearIndex(0)).toBe(0);
    expect(midYear.yearIndex(61)).toBe(1);
  });

  it('measures the time since the last firing, also over a weekend', () => {
    const friday = Date.UTC(2027, 0, 1);
    expect(new Date(friday).getUTCDay()).toBe(5);
    const gaps = yearsSinceLast(new Timeline(friday, 10).fires({ every: 'tradingDays' }));
    expect(gaps[0] * 365.25).toBeCloseTo(1);
    expect(gaps[3] * 365.25).toBeCloseTo(3);
  });

  it('turns dates into days', () => {
    expect(timeline.dayOf('2027-01-11')).toBe(10);
    expect(timeline.dateOf(10).getTime()).toBe(START + 10 * DAY_MS);
  });
});

describe('World.move', () => {
  function world(...stocks: Stock[]) {
    const created = new World(modelOf(stocks), noNoise);
    stocks.forEach((_, index) => created.open(index));
    return created;
  }

  it('moves what there is and reports what it could not pay', () => {
    const w = world(stock('a'), stock('b', { opening: 0 }));
    expect(w.move(0, 1, 1500, 'x')).toBe(1000);
    expect(w.balances[0]).toBe(0);
    expect(w.balances[1]).toBe(1000);
    expect(w.ledger.short[0]).toBe(500);
  });

  it('refuses a stock that has not opened', () => {
    const w = new World(modelOf([stock('a'), stock('b')]), noNoise);
    w.open(0);
    expect(w.move(0, 1, 100, 'x')).toBe(0);
    expect(w.move(1, 0, 100, 'x')).toBe(0);
    expect(w.ledger.short[1]).toBe(0);
  });

  it('counts withdrawals as deposits first', () => {
    const w = world(stock('a'));
    w.grow(0, 500);
    w.move(0, OUTSIDE, 700, 'x');
    expect(w.ledger.deposits[0]).toBe(300);
    w.move(0, OUTSIDE, 800, 'x');
    expect(w.ledger.deposits[0]).toBe(0);
    expect(w.balances[0]).toBe(0);
  });

  it('records money per calendar year', () => {
    const w = world(stock('a'));
    w.day = 400;
    w.move(OUTSIDE, 0, 10, 'x');
    expect(w.ledger.flows.get('x')![1]).toBe(10);
  });
});

describe('World.grow', () => {
  it('can take a balance to 0 and no further', () => {
    const w = new World(modelOf([stock('a')]), noNoise);
    w.open(0);
    w.grow(0, -5000);
    expect(w.balances[0]).toBe(0);
    expect(w.ledger.growth[0]).toBe(-1000);
  });
});

describe('runPass', () => {
  it('leaves a stock out before it opens and after it closes', () => {
    const model = modelOf([stock('a', { openDay: 150, closeDay: 300 })]);
    const series = runPass(model, noNoise).series[0];
    expect(Number.isNaN(series[1])).toBe(true);
    expect(series[2]).toBe(1000);
    // One sample past the close, so the line ends on the closing balance.
    expect(series[3]).toBe(1000);
    expect(Number.isNaN(series[4])).toBe(true);
  });

  it('shows no money in an account before it starts, however much is sent to it', () => {
    const timeline = new Timeline(START, 730);
    const fires = timeline.fires({ every: 'monthly' });
    const model = modelOf([stock('a', { opening: 1000 }), stock('b', { opening: 0, openDay: 150 })], timeline, [
      moveBetween(0, 1, 100, fires, 'x', 0),
    ]);
    const [a, b] = runPass(model, noNoise).series;
    expect(Number.isNaN(b[1])).toBe(true);
    // Opens 31 May, so 1 June and 1 July have arrived by day 200.
    expect(b[2]).toBe(200);
    expect(a[1]).toBe(1000);
  });
});

describe('summarize', () => {
  const timeline = new Timeline(START, 10);
  const model: Model = { ...modelOf([stock('a', { canRunOut: true })], timeline), sampleDays: [0, 5, 10] };
  const pass = (values: number[], short = 0) => ({
    series: [Float64Array.from(values)],
    ledger: { in: new Float64Array(1), out: new Float64Array(1), growth: new Float64Array(1), short: Float64Array.of(short), deposits: new Float64Array(1), shield: new Float64Array(1), firstPayout: new Float64Array(1), flows: new Map() },
    closing: new Float64Array(1),
    depositsAtEnd: new Float64Array(1),
    shieldAtEnd: new Float64Array(1),
    deposits: [null],
    shield: [null],
  });

  it('takes the median of each sample and leaves exactly half on each side', () => {
    const results = [[1, 10, 5], [2, 20, 1], [3, 30, 9], [4, 40, 3]].map((values) => pass(values));
    const { median } = summarize(model, results).stocks[0];
    expect(Array.from(median)).toEqual([2.5, 25, 4]);
    for (let sample = 0; sample < 3; sample++) {
      const below = results.filter((result) => result.series[0][sample] < median[sample]).length;
      expect(below).toBe(2);
    }
  });

  it('leaves a tenth and a quarter of the passes outside each edge of the bands', () => {
    const results = Array.from({ length: 21 }, (_, index) => pass([1, index * 100, 1]));
    const { spread } = summarize(model, results).stocks[0];
    expect(spread.p10[1]).toBe(200);
    expect(spread.p25[1]).toBe(500);
    expect(spread.p75[1]).toBe(1500);
    expect(spread.p90[1]).toBe(1800);
  });

  it('puts a share that falls between two passes between their values', () => {
    const results = [0, 100, 200, 300].map((value) => pass([1, value, 1]));
    const { spread } = summarize(model, results).stocks[0];
    expect(spread.p25[1]).toBeCloseTo(75, 9);
    expect(spread.p90[1]).toBeCloseTo(270, 9);
  });

  it('has no band where a line has stopped', () => {
    const { spread } = summarize(model, [pass([1, 2, NaN]), pass([3, 4, NaN])]).stocks[0];
    expect(spread.p10[1]).toBeCloseTo(2.2, 9);
    expect(Number.isNaN(spread.p10[2])).toBe(true);
    expect(Number.isNaN(spread.p90[2])).toBe(true);
  });

  it('counts the share of passes where nothing was missing', () => {
    const results = [pass([1, 1, 1]), pass([1, 1, 0], 50), pass([1, 1, 1]), pass([1, 1, 1])];
    expect(summarize(model, results).stocks[0].heldShare).toBe(0.75);
  });

  it('scales to the highest point of the band and not to where it ends', () => {
    const results = Array.from({ length: 20 }, (_, index) => pass([100 + index, 1000 + index, 0]));
    const { yMax, lastValue, spread } = summarize(model, results).stocks[0];
    expect(lastValue).toBe(0);
    expect(yMax).toBeGreaterThan(spread.p90[1]);
  });

  it('does not let one lucky pass decide the scale', () => {
    const steady = Array.from({ length: 19 }, () => pass([1, 1000, 1]));
    const { yMax } = summarize(model, [...steady, pass([1, 3000, 1])]).stocks[0];
    expect(yMax).toBeLessThan(1500);
  });

  it('keeps the median readable when the band gets very wide', () => {
    const results = Array.from({ length: 21 }, (_, index) => pass([1, index < 12 ? 100 : 100_000, 1]));
    const { yMax, median, spread } = summarize(model, results).stocks[0];
    expect(spread.p90[1]).toBeGreaterThan(yMax);
    expect(yMax).toBeLessThanOrEqual(4 * median[1] * 1.05);
  });

  it('keeps the scale from the first summary, so the graph does not jump', () => {
    const first = summarize(model, [pass([1, 100, 1])]);
    const later = summarize(model, [pass([1, 100, 1]), pass([1, 900, 1])], first);
    expect(later.stocks[0].yMax).toBe(first.stocks[0].yMax);
  });

  it('stops a line that closes early and keeps its last value', () => {
    const results = [pass([1, 2, NaN]), pass([3, 4, NaN])];
    const { median, lastValue } = summarize(model, results).stocks[0];
    expect(Number.isNaN(median[2])).toBe(true);
    expect(lastValue).toBe(3);
  });
});

describe('passNoise', () => {
  it('gives the same numbers every time and opposite numbers to the other pass of a pair', () => {
    const one = passNoise(3, 1)('market');
    const again = passNoise(3, 1)('market');
    const opposite = passNoise(3, -1)('market');
    const value = one();
    expect(again()).toBe(value);
    expect(opposite()).toBe(-value);
  });

  it('gives different factors and different pairs different numbers', () => {
    expect(passNoise(0, 1)('a')()).not.toBe(passNoise(0, 1)('b')());
    expect(passNoise(0, 1)('a')()).not.toBe(passNoise(1, 1)('a')());
  });
});
