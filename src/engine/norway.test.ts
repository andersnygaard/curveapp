import { describe, expect, it } from 'vitest';
import { taxableWealth, taxOnPension, taxOnWealth } from './norway';

const share = (perYear: number) => taxOnPension(perYear, true) / perYear;

describe('tax on pension', () => {
  // Published by Smarte Penger for 2026 as the tax before the credit, so these come from outside this code.
  it.each([
    [250_000, 26_369],
    [300_000, 40_769],
    [350_000, 55_898],
    [500_000, 102_548],
  ])('is on %i before the credit what a published table says', (perYear, tax) => {
    expect(Math.abs(taxOnPension(perYear, false) - tax)).toBeLessThan(1);
  });

  it('has the worked out rate for a pension of 40 000 a month, part by part', () => {
    const ordinary = (480_000 - 75_400 - 114_540) * 0.22;
    const social = 480_000 * 0.051;
    const bracket = (318_300 - 226_100) * 0.017 + (480_000 - 318_300) * 0.04;
    const credit = 39_100 - (437_100 - 294_200) * 0.191 - (480_000 - 437_100) * 0.06;
    expect(taxOnPension(480_000, true)).toBeCloseTo(ordinary + social + bracket - credit, 6);
    expect(share(480_000)).toBeCloseTo(0.181, 3);
  });

  it.each([
    [360_000, 0.09],
    [720_000, 0.237],
    [960_000, 0.28],
    [1_200_000, 0.311],
  ])('gives %i the share worked out for the board', (perYear, expected) => {
    expect(share(perYear)).toBeCloseTo(expected, 3);
  });

  it('takes nothing up to where the credit starts to shrink, since the credit also covers the bracket tax', () => {
    expect(taxOnPension(0, true)).toBe(0);
    expect(taxOnPension(240_000, true)).toBe(0);
    expect(taxOnPension(294_000, true)).toBe(0);
    expect(taxOnPension(300_000, true)).toBeGreaterThan(0);
  });

  it('has the high marginal tax where the credit shrinks fastest', () => {
    expect(taxOnPension(400_001, true) - taxOnPension(400_000, true)).toBeCloseTo(0.502, 3);
  });

  it('takes more without the credit, which only the old-age pension gives', () => {
    expect(taxOnPension(480_000, false) / 480_000).toBeCloseTo(0.201, 3);
    expect(taxOnPension(480_000, false)).toBeGreaterThan(taxOnPension(480_000, true));
  });

  it('has lost the credit altogether at a high pension', () => {
    expect(taxOnPension(1_000_000, true)).toBeCloseTo(taxOnPension(1_000_000, false), 6);
  });

  it('never leaves less for a higher pension', () => {
    let left = 0;
    for (let perYear = 0; perYear <= 2_000_000; perYear += 1_000) {
      const now = perYear - taxOnPension(perYear, true);
      expect(now).toBeGreaterThanOrEqual(left);
      left = now;
    }
  });

  it('keeps the social contribution low just above where it starts', () => {
    expect(taxOnPension(100_000, false)).toBeCloseTo((100_000 - 99_650) * 0.25, 6);
  });
});

describe('wealth tax', () => {
  const rates = { allowance: 1_900_000, rate: 0.01, highFrom: 21_500_000, highRate: 0.011 };
  const none = { funds: 0, cash: 0, homes: [] };
  const home = (value: number, loan = 0) => ({ kind: 'primary' as const, value, loan });

  // Worked out by hand for the board, with made-up amounts. They are not checked in Skatteetaten's calculator.
  it.each([
    ['a fund of 5 million', { ...none, funds: 5_000_000 }, 4_000_000, 21_000],
    ['a fund of 10 million', { ...none, funds: 10_000_000 }, 8_000_000, 61_000],
    ['a fund of 30 million, past the higher rate', { ...none, funds: 30_000_000 }, 24_000_000, 223_500],
    ['a fund of 3 million', { ...none, funds: 3_000_000 }, 2_400_000, 5_000],
    ['a fund and a home', { ...none, funds: 10_000_000, homes: [home(8_000_000)] }, 10_000_000, 81_000],
    ['a smaller fund and a home', { ...none, funds: 3_000_000, homes: [home(8_000_000)] }, 4_400_000, 25_000],
    ['a home of 8 million alone', { ...none, homes: [home(8_000_000)] }, 2_000_000, 1_000],
    ['a home right at the limit', { ...none, homes: [home(14_000_000)] }, 3_500_000, 16_000],
    ['a home of 20 million', { ...none, homes: [home(20_000_000)] }, 7_700_000, 58_000],
    ['a home and a cabin', { ...none, homes: [home(8_000_000), { kind: 'cabin' as const, value: 3_000_000, loan: 0 }] }, 2_900_000, 10_000],
    ['a home and a secondary home', { ...none, homes: [home(8_000_000), { kind: 'secondary' as const, value: 3_000_000, loan: 0 }] }, 5_000_000, 31_000],
    ['money in a regular account, which counts in full', { ...none, cash: 5_000_000 }, 5_000_000, 31_000],
  ])('counts %s', (_, wealth, counted, tax) => {
    expect(taxableWealth(wealth)).toBeCloseTo(counted, 2);
    expect(taxOnWealth(taxableWealth(wealth), rates)).toBeCloseTo(tax, 2);
  });

  it.each([
    ['primary', 7_500],
    ['cabin', 9_000],
    ['secondary', 30_000],
  ] as const)('takes this much for a %s home of 3 million, when the allowance is already used', (kind, tax) => {
    const wealth = { ...none, cash: rates.allowance, homes: [{ kind, value: 3_000_000, loan: 0 }] };
    expect(taxOnWealth(taxableWealth(wealth), rates)).toBeCloseTo(tax, 2);
  });

  it('takes off the part of a loan that falls on shares only with their discount, and the rest in full', () => {
    const wealth = { ...none, funds: 10_000_000, homes: [home(8_000_000, 3_000_000)] };
    // The loan falls 10 to 8 on the fund and the home. 1 666 667 counts 80 % and 1 333 333 in full.
    expect(taxableWealth(wealth)).toBeCloseTo(10_000_000 - 1_666_667 * 0.8 - 1_333_333, 0);
    expect(taxOnWealth(taxableWealth(wealth), rates)).toBeCloseTo(54_333, 0);
  });

  it('can bring a loan down below the allowance, so there is no tax', () => {
    const wealth = { ...none, funds: 3_000_000, homes: [home(8_000_000, 3_000_000)] };
    expect(taxableWealth(wealth)).toBeCloseTo(1_563_636, 0);
    expect(taxOnWealth(taxableWealth(wealth), rates)).toBe(0);
  });

  it('takes a loan against money in a regular account off in full', () => {
    expect(taxableWealth({ cash: 5_000_000, funds: 0, homes: [home(0, 1_000_000)] })).toBe(4_000_000);
  });

  it('never goes below nothing, also with nothing to set a loan against', () => {
    expect(taxableWealth({ ...none, homes: [home(4_000_000, 3_000_000)] })).toBe(0);
    expect(taxableWealth({ ...none, homes: [home(0, 1_000_000)] })).toBe(0);
    expect(taxableWealth(none)).toBe(0);
    expect(taxOnWealth(0, rates)).toBe(0);
  });

  it('stays with the higher rate when it is set to start below the allowance', () => {
    expect(taxOnWealth(3_000_000, { ...rates, highFrom: 1_000_000 })).toBeCloseTo((3_000_000 - 1_900_000) * 0.011, 6);
  });
});
