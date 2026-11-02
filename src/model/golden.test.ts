import { describe, expect, it } from 'vitest';
import golden from './__golden__/legacy-engine.json';
import { runPass } from '../engine/engine';
import { noNoise } from '../engine/random';
import { oldDraws, toInput, toVersion1, type LegacyScenario } from './__golden__/legacy';
import { compile } from './compile';
import { inputOf } from './graph';
import { parseGraph } from './storage';
import type { DefaultNames } from './types';

// Recorded from the engine this one replaced, before it was deleted. If these fail, an old result has changed.
const { every, cases } = golden as unknown as {
  every: number;
  cases: {
    seed: number;
    years: number;
    scenario: LegacyScenario;
    sampleCount: number;
    expected: number[][];
    yMax: number[];
    afterTax: (number | null)[];
    passes: number[][][];
  }[];
};

const picked = (series: ArrayLike<number>) =>
  Array.from(series).filter((_, index) => index % every === 0 || index === series.length - 1);

function expectClose(actual: number[], recorded: number[]) {
  expect(actual.length).toBe(recorded.length);
  actual.forEach((value, index) => {
    const tolerance = 1e-9 * Math.max(1, Math.abs(recorded[index]));
    expect(Math.abs(value - recorded[index])).toBeLessThanOrEqual(tolerance);
  });
}

const names: DefaultNames = {
  income: 'a',
  transfer: 'b',
  budget: 'c',
  budgetHousing: 'd',
  budgetLiving: 'e',
  account: 'f',
  return: 'g',
  otp: 'h',
  folketrygd: 'i',
  withdrawal: 'j',
};

describe('boxes stored by the old app', () => {
  it.each(cases.map((recorded, index) => [index + 1, recorded] as const))('scenario %i gives the old numbers', (_, recorded) => {
    const graph = parseGraph(JSON.stringify(toVersion1(recorded.scenario)), names);
    const { series } = runPass(compile(inputOf(graph), recorded.years), noNoise);
    series.forEach((values, chart) => expectClose(picked(values), recorded.expected[chart]));
  });
});

describe('the numbers recorded from the old engine', () => {
  it.each(cases.map((recorded, index) => [index + 1, recorded] as const))('scenario %i', (_, recorded) => {
    const model = compile(toInput(recorded.scenario), recorded.years);
    expect(model.sampleDays.length).toBe(recorded.sampleCount);

    const { expected, yMax, nextPass } = oldDraws(model, recorded.seed);
    expected.series.forEach((series, chart) => expectClose(picked(series), recorded.expected[chart]));
    expectClose(yMax, recorded.yMax);
    for (const pass of recorded.passes) {
      const next = nextPass();
      pass.forEach((series, chart) => expectClose(picked(next[chart]), series));
    }

    const last = model.sampleDays.length - 1;
    model.charted.forEach((stock, chart) => {
      const { taxOnGain } = model.stocks[stock];
      const value = expected.series[chart][last];
      const afterTax =
        taxOnGain === undefined ? null : value - taxOnGain * Math.max(0, value - expected.depositsAtEnd[stock]);
      if (recorded.afterTax[chart] === null) expect(afterTax).toBeNull();
      else expectClose([afterTax!], [recorded.afterTax[chart]!]);
    });
  });
});
