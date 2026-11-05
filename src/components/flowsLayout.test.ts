import { describe, expect, it } from 'vitest';
import { areaOf, edgeOf, foldedSources, outline, pathOf, placeInBand, stackOf, type Point } from './flowsLayout';

// Ten years, 100 wide each, and 1 kr a month is 1 down the screen from 300. The numbers are made up.
const YEARS = 10;
const edges = Array.from({ length: YEARS + 1 }, (_, year) => 100 + year * 100);
const toY = (value: number) => 300 - value;
const scale = { edges, toY, yMax: 300, plotHeight: 300 };
const names = { surplus: 'Left over', short: 'Missing', tax: 'Tax' };
const every = (value: number) => Array.from({ length: YEARS }, () => value);
const paying = (level: number, from = 0, until = YEARS) => Array.from({ length: YEARS }, (_, year) => (year >= from && year < until ? level : 0));
const ys = (path: string) => [...path.matchAll(/[ML][\d.-]+ ([\d.-]+)/g)].map((match) => Number(match[1]));

describe('the sources in the withdrawals chart', () => {
  it('fold the boxes past the last colour into one', () => {
    const sources = Array.from({ length: 9 }, (_, slot) => ({ name: `Box ${slot}`, slot, perMonth: [slot] }));
    const folded = foldedSources(sources, 'Other');
    expect(folded).toHaveLength(8);
    expect(folded.at(-1)).toEqual({ name: 'Other', slot: 7, perMonth: [7 + 8] });
  });

  it('leave a single box past the last colour as it is', () => {
    const sources = Array.from({ length: 8 }, (_, slot) => ({ name: `Box ${slot}`, slot, perMonth: [slot] }));
    expect(foldedSources(sources, 'Other')).toBe(sources);
  });
});

describe('an outline', () => {
  it('is flat through each year and steps between them', () => {
    const points = outline([10, 20], edges, toY);
    expect(points[0]).toEqual([100, 290]);
    expect(points.at(-1)).toEqual([300, 280]);
    // The step is short and lies around where the second year begins.
    const step = points.slice(1, -1);
    expect(step).toHaveLength(7);
    expect(Math.min(...step.map(([x]) => x))).toBe(195);
    expect(Math.max(...step.map(([x]) => x))).toBe(205);
  });

  it('is written with one decimal, and an area goes back along its lower edge', () => {
    const upper: Point[] = [[0, 1], [10, 1]];
    const lower: Point[] = [[0, 5], [10, 5]];
    expect(pathOf(upper)).toBe('M0.0 1.0L10.0 1.0');
    expect(areaOf(upper, lower)).toBe('M0.0 1.0L10.0 1.0L10.0 5.0L0.0 5.0Z');
  });

  it('draws no line along a layer where it has no height', () => {
    const flat = outline(every(0), edges, toY);
    expect(edgeOf(flat, flat)).toBe('');
    expect(edgeOf(outline(every(50), edges, toY), flat)).toMatch(/^M100\.0 250\.0/);
  });
});

describe('a name in a band', () => {
  it('goes in the middle of the widest part that is tall enough', () => {
    const upper = every(100);
    const lower = [...every(200).slice(0, 5), ...every(110).slice(5)];
    expect(placeInBand('Fund', upper, lower, edges)).toEqual({ x: 350, y: 150 });
  });

  it('fits nowhere in a band that is too thin', () => {
    expect(placeInBand('Fund', every(100), every(110), edges)).toBeNull();
  });
});

describe('the stack', () => {
  it('stands each source on the one below it', () => {
    const sources = [
      { name: 'OTP', slot: 0, perMonth: every(50) },
      { name: 'Fund', slot: 1, perMonth: every(100) },
    ];
    const { layers } = stackOf({ sources, need: every(150), tax: every(0), wealthTax: every(0) }, scale, names);
    expect(Math.min(...ys(layers[0].area))).toBe(250);
    expect(Math.min(...ys(layers[1].area))).toBe(150);
  });

  it('has a band beyond the need and one up to it only where there is something to see', () => {
    const sources = [{ name: 'Fund', slot: 0, perMonth: Array.from({ length: YEARS }, (_, year) => (year < 5 ? 150 : 50)) }];
    const stack = stackOf({ sources, need: every(100), tax: every(0), wealthTax: every(0) }, scale, names);
    expect(stack.surplus?.area).toBeTruthy();
    expect(stack.short?.area).toBeTruthy();
    expect(stack.tax).toBeNull();

    const exact = stackOf({ sources: [{ name: 'Fund', slot: 0, perMonth: every(100) }], need: every(100), tax: every(0), wealthTax: every(0) }, scale, names);
    expect(exact.surplus).toBeNull();
    expect(exact.short).toBeNull();
  });

  it('puts the tax and the wealth tax on top of it all', () => {
    const sources = [{ name: 'Fund', slot: 0, perMonth: every(100) }];
    const stack = stackOf({ sources, need: every(100), tax: every(20), wealthTax: every(10) }, scale, names);
    expect(Math.min(...ys(stack.tax!.area))).toBe(170);
  });

  it('starts the need line when the need does, with its label beside it if there is room', () => {
    const sources = [{ name: 'Fund', slot: 0, perMonth: every(100) }];
    const late = stackOf({ sources, need: paying(100, 3), tax: every(0), wealthTax: every(0) }, scale, names);
    expect(late.need?.path).toMatch(/^M400\.0 200\.0/);
    expect(late.need?.label).toEqual({ x: 392, y: 200, anchor: 'end' });

    const early = stackOf({ sources, need: every(100), tax: every(0), wealthTax: every(0) }, scale, names);
    expect(early.need?.label).toEqual({ x: 108, y: 191, anchor: 'start' });

    expect(stackOf({ sources, need: every(0), tax: every(0), wealthTax: every(0) }, scale, names).need).toBeNull();
  });
});
