// Where a run of payments changes, on plain numbers. What the payments are is the plan's business, in plan.test.ts.
import { describe, expect, it } from 'vitest';
import { Timeline } from '../engine/timeline';
import { amountsOf, dayAfter, intervalOf, stretchesOf, type Payment, type Stretch } from './stretches';

const every = (gap: number, amounts: number[], from = 0): Payment[] =>
  amounts.map((amount, index) => ({ day: from + index * gap, amount }));
const times = (count: number, amount: number) => Array.from({ length: count }, () => amount);
const shape = (stretches: Stretch[]) => stretches.map(({ firstDay, lastDay, payments }) => [firstDay, lastDay, payments]);

describe('stretchesOf', () => {
  it('keeps payments of the same amount at a steady pace together', () => {
    expect(stretchesOf(every(30, times(12, 1_000)), false)).toEqual([
      { firstDay: 0, lastDay: 330, gap: 30, first: 1_000, last: 1_000, payments: 12 },
    ]);
  });

  it('starts a new stretch when the amount changes by more than a tenth', () => {
    expect(shape(stretchesOf(every(30, [...times(6, 10_000), ...times(6, 12_000)]), false))).toEqual([
      [0, 150, 6],
      [180, 330, 6],
    ]);
    expect(stretchesOf(every(30, [...times(6, 10_000), ...times(6, 10_900)]), false)).toHaveLength(1);
  });

  it('lets a small amount change by up to 500 without a new stretch', () => {
    expect(stretchesOf(every(30, [...times(6, 1_000), ...times(6, 1_500)]), false)).toHaveLength(1);
    expect(stretchesOf(every(30, [...times(6, 1_000), ...times(6, 1_600)]), false)).toHaveLength(2);
  });

  it('starts a new stretch after a pause', () => {
    const payments = [...every(30, times(3, 1_000)), ...every(30, times(3, 1_000), 300)];
    expect(shape(stretchesOf(payments, false))).toEqual([
      [0, 60, 3],
      [300, 360, 3],
    ]);
  });

  it('lets a single last payment that differs belong to the stretch before it', () => {
    expect(stretchesOf(every(30, [...times(5, 10_000), 3_000]), false)).toEqual([
      { firstDay: 0, lastDay: 150, gap: 30, first: 10_000, last: 10_000, payments: 6 },
    ]);
  });

  it('lets a single first payment that differs belong to the stretch after it', () => {
    expect(shape(stretchesOf(every(30, [3_000, ...times(5, 10_000)]), false))).toEqual([[0, 150, 6]]);
  });

  it('goes on past one payment that did not come', () => {
    const payments = every(30, times(12, 1_000)).filter(({ day }) => day !== 150);
    expect(shape(stretchesOf(payments, false))).toEqual([[0, 330, 11]]);
  });

  it('keeps any amount together when asked to', () => {
    const payments = every(30, [...times(3, 1_000), ...times(3, 5_000)]);
    expect(stretchesOf(payments, true)).toHaveLength(1);
    expect(stretchesOf(payments, false)).toHaveLength(2);
  });
});

describe('intervalOf', () => {
  it.each([
    [null, 'once'],
    [1, 'daily'],
    [3, 'daily'],
    [7, 'weekly'],
    [31, 'monthly'],
    [91, 'quarterly'],
    [365, 'yearly'],
  ] as const)('calls a gap of %s days %s', (gap, interval) => {
    expect(intervalOf(gap)).toBe(interval);
  });
});

describe('dayAfter', () => {
  // Day 0 is 1 January 2027.
  const timeline = new Timeline(Date.UTC(2027, 0, 1), 3 * 365);
  const stretch = (lastDay: number, gap: number): Stretch => ({ firstDay: 0, lastDay, gap, first: 1, last: 1, payments: 2 });

  it('follows the calendar for whole months', () => {
    expect(dayAfter(stretch(0, 31), 'monthly', timeline)).toBe(31);
    expect(dayAfter(stretch(31, 28), 'monthly', timeline)).toBe(59);
    expect(dayAfter(stretch(0, 365), 'yearly', timeline)).toBe(365);
  });

  it('counts days for anything shorter', () => {
    expect(dayAfter(stretch(10, 7), 'weekly', timeline)).toBe(17);
  });
});

describe('amountsOf', () => {
  const stretch: Stretch = { firstDay: 0, lastDay: 60, gap: 30, first: 10_000, last: 10_500, payments: 3 };

  it('keeps the first amount when the last is only a little different', () => {
    expect(amountsOf(stretch, [], false)).toEqual({ amount: 10_000, lastAmount: 10_000 });
  });

  it('gives the last amount as well when it has really risen', () => {
    expect(amountsOf({ ...stretch, last: 11_500 }, [], false)).toEqual({ amount: 10_000, lastAmount: 11_500 });
  });

  it('gives the lowest and highest for what stays on one line, even when it rises and falls', () => {
    const payments = every(30, [3_000, 5_000, 4_000, 9_000]);
    expect(amountsOf(stretch, payments, true)).toEqual({ amount: 3_000, lastAmount: 5_000 });
  });
});
