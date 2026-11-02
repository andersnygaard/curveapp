import { OUTSIDE } from '../../engine/engine';
import { earnFolketrygd, estimatedDivisor, G_REGULATION_DATE, payFolketrygd, regulateWithG } from '../../engine/norway';
import { today, validDate } from '../dates';
import type { BoxSpec, DiagnosticCode } from '../spec';
import { MANY } from '../spec';
import type { FolketrygdBox } from '../types';
import { salaryFrom } from './pay';

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

// A calculated balance, not money. It takes salary as a basis, and the pension it pays is new money.
export const folketrygdSpec: BoxSpec<FolketrygdBox> = {
  defaults: (names) => ({ name: names.folketrygd, startAmount: 0, startDate: today(), payoutAge: null, divisor: null }),
  takes: { basis: { max: MANY, from: ['income'] } },
  gives: { money: 1 },
  holds: true,
  usesG: () => true,
  declare(pension, context) {
    const { name, startAmount, startDate, payoutAge } = pension.data;
    const payoutDay = payoutAge === null ? null : context.dayOfAge(payoutAge);
    context.addStock(pension, {
      name,
      unit: 'notional',
      currency: 'NOK',
      opening: Math.max(0, startAmount),
      openDay: context.timeline.dayOf(validDate(startDate)),
      closeDay: payoutDay ?? undefined,
      payout: payoutDay === null ? undefined : { fromDay: payoutDay, label: `payout:${pension.id}` },
    });
  },
  build(pension, context) {
    const { timeline, assumptions } = context;
    const stock = context.stockOf(pension);
    const startDate = validDate(pension.data.startDate);
    const openDay = timeline.dayOf(startDate);
    const { payoutAge } = pension.data;
    const payoutDay = (payoutAge === null ? null : context.dayOfAge(payoutAge)) ?? undefined;

    context.addRule(regulateWithG(stock, openDay, timeline.fires({ annually: G_REGULATION_DATE, from: 1, until: payoutDay })));

    const yearEnd = timeline.fires({ every: 'yearly', at: 'periodEnd', from: openDay, until: payoutDay });
    context.addRule(
      earnFolketrygd({
        stock,
        openDay,
        regulatedThisYear: new Date(startDate).getUTCMonth() >= G_REGULATION_DATE.month,
        salary: salaryFrom(context.into(pension, 'basis'), context),
        baseG: assumptions.g.value,
        growth: assumptions.g.growth,
        yearEnd,
        fires: Uint8Array.from(yearEnd, (fired, day) => (fired || day === openDay ? 1 : 0)),
      }),
    );

    if (payoutDay === undefined || payoutAge === null) return;
    const target = context.outOf(pension, 'money')[0];
    context.addRule(
      payFolketrygd(
        stock,
        target ? context.stockOf(target) : OUTSIDE,
        divisorOf(pension, payoutAge),
        timeline.fires({ every: 'monthly', from: payoutDay }),
        `payout:${pension.id}`,
      ),
    );
  },
  check(pension, query) {
    const codes: DiagnosticCode[] = [];
    if (pension.data.payoutAge !== null && query.assumptions.birthYear === null) codes.push('needsBirthYear');
    if (pension.data.payoutAge === null && query.outOf(pension, 'money').length > 0) codes.push('needsPayoutAge');
    return codes;
  },
};
