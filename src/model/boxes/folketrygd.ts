import { OUTSIDE } from '../../engine/engine';
import { earnFolketrygd, estimatedDivisor, G_REGULATION_DATE, payFolketrygd, regulateWithG } from '../../engine/norway';
import { today, validDate } from '../dates';
import type { BoxSpec, Compiling } from '../spec';
import { MANY } from '../spec';
import type { FolketrygdBox } from '../types';
import { addTaxedPension, pensionChecks, salaryFrom } from './pay';

export type FolketrygdData = {
  name: string;
  startAmount: number;
  startDate: string;
  // Empty means that nothing is paid out.
  payoutAge: number | null;
  // Empty means the estimate for that age.
  divisor: number | null;
};

export const divisorOf = ({ data }: FolketrygdBox, age: number) =>
  data.divisor !== null && data.divisor > 0 ? data.divisor : estimatedDivisor(age);

// The balance becomes a pension at the payout age, or when it starts if that age has already passed.
function closeDayOf(pension: FolketrygdBox, context: Compiling): number | undefined {
  const { payoutAge, startDate } = pension.data;
  const payoutDay = payoutAge === null ? null : context.dayOfAge(payoutAge);
  if (payoutDay === null) return undefined;
  return Math.max(payoutDay, context.timeline.dayOf(validDate(startDate)));
}

// A calculated balance, not money. It takes salary as a basis, and the pension it pays is new money.
export const folketrygdSpec: BoxSpec<FolketrygdBox> = {
  defaults: (names) => ({ name: names.folketrygd, startAmount: 0, startDate: today(), payoutAge: null, divisor: null }),
  takes: { basis: { max: MANY, from: ['income'] } },
  gives: { money: 1 },
  holds: true,
  readsG: true,
  startsOn: ({ data }) => validDate(data.startDate),
  declare(pension, context) {
    const { name, startAmount, startDate } = pension.data;
    context.addStock(pension, {
      name,
      unit: 'calculated',
      currency: 'NOK',
      opening: Math.max(0, startAmount),
      openDay: context.timeline.dayOf(validDate(startDate)),
      closeDay: closeDayOf(pension, context),
    });
  },
  build(pension, context) {
    const { timeline, assumptions } = context;
    const stock = context.stockOf(pension);
    const startDate = validDate(pension.data.startDate);
    const openDay = timeline.dayOf(startDate);
    const { payoutAge } = pension.data;
    const closeDay = closeDayOf(pension, context);

    context.addRule(regulateWithG(stock, openDay, timeline.fires({ annually: G_REGULATION_DATE, from: 1, until: closeDay })));

    const yearEnd = timeline.fires({ every: 'yearly', at: 'periodEnd', from: openDay, until: closeDay });
    context.addRule(
      earnFolketrygd({
        stock,
        openDay,
        regulatedThisYear: new Date(startDate).getUTCMonth() >= G_REGULATION_DATE.month,
        salary: salaryFrom(context.into(pension, 'basis'), context),
        baseG: assumptions.g.value,
        growth: assumptions.g.growth,
        yearEnd,
        closeDay,
        fires: Uint8Array.from(yearEnd, (fired, day) => (fired || day === openDay || day === closeDay ? 1 : 0)),
      }),
    );

    if (closeDay === undefined || payoutAge === null) return;
    const target = context.outOf(pension, 'money')[0];
    // The old-age pension is the one pension that gives the credit for pension income.
    const label = addTaxedPension(pension, true, context);
    context.addRule(
      payFolketrygd(
        stock,
        target ? context.stockOf(target) : OUTSIDE,
        divisorOf(pension, payoutAge),
        timeline.fires({ every: 'monthly', from: closeDay }),
        label,
      ),
    );
  },
  check: pensionChecks,
};
