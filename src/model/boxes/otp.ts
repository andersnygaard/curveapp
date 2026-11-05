import { OUTSIDE } from '../../engine/engine';
import { otpDeposit } from '../../engine/norway';
import { payOutOverYears } from '../../engine/rules';
import { DAYS_PER_YEAR } from '../../engine/timeline';
import { today, validDate } from '../dates';
import type { BoxSpec, CompileContext, DiagnosticCode } from '../spec';
import { MANY } from '../spec';
import type { OtpBox } from '../types';
import { addTaxedPension, basisOf, incomeSchedule, incomesOf, paymentsPerYear, salaryFrom } from './pay';
import { annualRateOf } from './returnBox';

const percent = (value: number) => Math.max(0, value) / 100;

export type OtpData = {
  name: string;
  startAmount: number;
  startDate: string;
  lowRate: number;
  highRate: number;
  // Empty means that nothing is paid out.
  payoutAge: number | null;
  payoutYears: number;
};

function buildDeposits(otp: OtpBox, context: CompileContext) {
  const wired = context.into(otp, 'basis');
  const salary = salaryFrom(wired, context);
  for (const income of incomesOf(wired).filter((candidate) => basisOf(candidate) > 0)) {
    context.addRule(
      otpDeposit({
        stock: context.stockOf(otp),
        lowRate: percent(otp.data.lowRate),
        highRate: percent(otp.data.highRate),
        salary,
        share: (day) => basisOf(income) / salary(day) / paymentsPerYear(income),
        baseG: context.assumptions.g.value,
        fires: context.timeline.fires(incomeSchedule(income, context)),
      }),
    );
  }
}

function buildPayout(otp: OtpBox, context: CompileContext) {
  if (otp.data.payoutAge === null) return;
  const fromDay = context.dayOfAge(otp.data.payoutAge);
  if (fromDay === null) return;
  const market = context.into(otp, 'influence')[0];
  const target = context.outOf(otp, 'money')[0];
  // A payout that began before the simulation has already used some of its term.
  const monthsGone = fromDay < 0 ? Math.round((-fromDay / DAYS_PER_YEAR) * 12) : 0;
  // Only the old-age pension gives the credit.
  const label = addTaxedPension(otp, false, context);
  context.addRule(
    payOutOverYears({
      stock: context.stockOf(otp),
      to: target ? context.stockOf(target) : OUTSIDE,
      payments: Math.round(Math.max(1, otp.data.payoutYears) * 12) - monthsGone,
      annualRate: market?.type === 'return' ? annualRateOf(market) : 0,
      fires: context.timeline.fires({ every: 'monthly', from: fromDay }),
      label,
    }),
  );
}

export const otpSpec: BoxSpec<OtpBox> = {
  defaults: (names) => ({
    name: names.otp,
    startAmount: 0,
    startDate: today(),
    lowRate: 5,
    highRate: 10,
    payoutAge: null,
    payoutYears: 10,
  }),
  takes: {
    basis: { max: MANY, from: ['income'] },
    influence: { max: MANY, from: ['return'] },
  },
  gives: { money: 1 },
  holds: true,
  usesG: (otp, query) => incomesOf(query.into(otp, 'basis')).some((income) => basisOf(income) > 0),
  declare(otp, context) {
    const { name, startAmount, startDate } = otp.data;
    context.addStock(otp, {
      name,
      unit: 'money',
      currency: 'NOK',
      opening: Math.max(0, startAmount),
      openDay: context.timeline.dayOf(validDate(startDate)),
    });
  },
  build(otp, context) {
    buildDeposits(otp, context);
    buildPayout(otp, context);
  },
  check(otp, query) {
    const codes: DiagnosticCode[] = [];
    if (otp.data.payoutAge !== null && query.assumptions.birthYear === null) codes.push('needsBirthYear');
    if (otp.data.payoutAge === null && query.outOf(otp, 'money').length > 0) codes.push('needsPayoutAge');
    return codes;
  },
};
