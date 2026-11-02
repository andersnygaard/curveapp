import { OUTSIDE } from '../../engine/engine';
import { otpDeposit } from '../../engine/norway';
import { payOutOverYears } from '../../engine/rules';
import { today, validDate } from '../dates';
import type { BoxSpec, CompileContext, DiagnosticCode } from '../spec';
import { MANY } from '../spec';
import type { OtpBox } from '../types';
import { basisOf, incomeSchedule, incomesOf, paymentsPerYear, salaryFrom } from './pay';
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
  context.addRule(
    payOutOverYears({
      stock: context.stockOf(otp),
      to: target ? context.stockOf(target) : OUTSIDE,
      years: Math.max(1, otp.data.payoutYears),
      annualRate: market?.type === 'return' ? annualRateOf(market) : 0,
      fires: context.timeline.fires({ every: 'monthly', from: fromDay }),
      label: `payout:${otp.id}`,
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
    const { name, startAmount, startDate, payoutAge } = otp.data;
    const fromDay = payoutAge === null ? null : context.dayOfAge(payoutAge);
    context.addStock(otp, {
      name,
      unit: 'money',
      currency: 'NOK',
      opening: Math.max(0, startAmount),
      openDay: context.timeline.dayOf(validDate(startDate)),
      payout: fromDay === null ? undefined : { fromDay, label: `payout:${otp.id}` },
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
