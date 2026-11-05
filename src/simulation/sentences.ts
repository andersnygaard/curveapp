// How the summary of a simulation is put into words. Plain functions of the texts, so they can be tested without a screen.
import { moneyFormat, shareDown } from '../components/formats';
import type { Layout } from '../engine/simulate';
import { lastFinite, type GateSummary, type StockSummary } from '../engine/statistics';
import { DAY_MS } from '../engine/timeline';
import type { Translations } from '../i18n';
import { LAST_AGE } from '../model/compile';

// What the passes on screen cover. While a new run is on its way, that is not yet the period just chosen.
export interface Reading {
  years: number;
  layout: Layout;
  birthYear: number | null;
  // They run to the last age, so the text gives the age and not the years.
  toLastAge: boolean;
}

export function sentencesFor(t: Translations, { years, layout, birthYear, toLastAge }: Reading) {
  const percent = (share: number) => shareDown(t.locale).format(share);
  const ageAt = (day: number) => new Date(layout.startMs + day * DAY_MS).getUTCFullYear() - (birthYear ?? 0);

  return {
    // The balance when an account closes before the end, and otherwise the median at the end.
    headline(stock: StockSummary): string {
      const amount = moneyFormat(t.locale, stock.currency).format(stock.lastValue);
      if (stock.closeDay !== null && stock.closeDay < layout.totalDays) {
        return t.balanceAtAge(ageAt(stock.closeDay), amount);
      }
      return toLastAge ? t.medianAtAge(LAST_AGE, amount) : t.medianAfter(years, amount);
    },

    // What the bands show, for those who cannot see them. Bands with no width have nothing to say.
    spread({ spread, currency }: StockSummary): string {
      const money = moneyFormat(t.locale, currency);
      const low = money.format(lastFinite(spread.p10));
      const high = money.format(lastFinite(spread.p90));
      return low === high ? '' : ` ${t.spreadAtEnd(low, high)}`;
    },

    gate: (gate: GateSummary): string =>
      toLastAge
        ? t.gateHeldToAge(gate.name, percent(gate.heldShare), LAST_AGE)
        : t.gateHeldWholePeriod(gate.name, percent(gate.heldShare)),

    held: (share: number): string => (toLastAge ? t.heldToAge(percent(share), LAST_AGE) : t.heldWholePeriod(percent(share))),
  };
}

export type Sentences = ReturnType<typeof sentencesFor>;
