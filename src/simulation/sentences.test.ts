import { describe, expect, it } from 'vitest';
import type { StockSummary } from '../engine/statistics';
import { DAYS_PER_YEAR } from '../engine/timeline';
import { translations } from '../i18n';
import { sentencesFor, type Reading } from './sentences';

const t = translations.en;
const layout = { startMs: Date.UTC(2030, 0, 1), totalDays: 30 * DAYS_PER_YEAR, sampleDays: [0, 30 * DAYS_PER_YEAR] };
const reading: Reading = { years: 30, layout, birthYear: 1990, toLastAge: false };
// Only what the sentences read. The numbers are made up.
const stock = (summary: Partial<StockSummary>) =>
  ({
    name: 'Fund',
    currency: 'NOK',
    lastValue: 1_000_000,
    closeDay: null,
    spread: { p10: Float64Array.of(800_000), p25: Float64Array.of(900_000), p75: Float64Array.of(1_100_000), p90: Float64Array.of(1_200_000) },
    ...summary,
  }) as StockSummary;
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('the sentences about a simulation', () => {
  it('give the median after the years the passes on screen cover', () => {
    expect(plain(sentencesFor(t, reading).headline(stock({})))).toBe('Median after 30 years: NOK 1,000,000');
  });

  it('give the last age instead, when the passes run to it', () => {
    expect(plain(sentencesFor(t, { ...reading, toLastAge: true }).headline(stock({})))).toBe('Median at age 95: NOK 1,000,000');
  });

  it('give the balance at the age an account closes before the end', () => {
    const closed = stock({ lastValue: 0, closeDay: 10 * DAYS_PER_YEAR + 100 });
    expect(plain(sentencesFor(t, reading).headline(closed))).toBe('Balance at age 50: NOK 0');
  });

  it('say where most of the passes end, and nothing when the bands have no width', () => {
    const say = sentencesFor(t, reading);
    expect(plain(say.spread(stock({})))).toBe(' Eight in ten passes end between NOK 800,000 and NOK 1,200,000.');
    const flat = Float64Array.of(1_000_000);
    expect(say.spread(stock({ spread: { p10: flat, p25: flat, p75: flat, p90: flat } }))).toBe('');
  });

  it('round a share down, so all the passes means every single one', () => {
    expect(sentencesFor(t, reading).held(0.999)).toBe('99% of the passes last the whole period.');
    expect(sentencesFor(t, { ...reading, toLastAge: true }).gate({ id: 'need', name: 'Withdrawal', heldShare: 1 })).toBe(
      'Withdrawal is covered to age 95 in 100% of the passes.',
    );
  });
});
