import { payIncome, type Route } from '../../engine/rules';
import type { BoxSpec, CompileContext, DiagnosticCode } from '../spec';
import { MANY } from '../spec';
import type { IncomeBox } from '../types';
import { budgetShare } from './budget';
import { amountOf, incomeSchedule, type IncomeInterval } from './pay';

const DEFAULT_PENSION_BASIS = 850_000;

export type IncomeData = {
  name: string;
  // What is paid out, after tax.
  amount: number;
  interval: IncomeInterval;
  // The gross salary a year that OTP and Folketrygden read. Bonus or rent can have 0 here.
  pensionBasis: number;
  stopsAtRetirement: boolean;
};

function routesFrom(income: IncomeBox, context: CompileContext): Route[] {
  return context.outOf(income, 'money').flatMap((next): Route[] => {
    const target = next.type === 'transfer' || next.type === 'budget' ? context.outOf(next, 'money')[0] : next;
    if (!target) return [];
    const to = context.stockOf(target);
    const label = `${income.id}:${target.id}`;
    if (next.type === 'transfer') return [{ to, label, amount: Math.max(0, next.data.amount) }];
    if (next.type === 'budget') return [{ to, label, share: budgetShare(next, context) }];
    return [{ to, label }];
  });
}

export const incomeSpec: BoxSpec<IncomeBox> = {
  defaults: (names) => ({
    name: names.income,
    amount: 50_000,
    interval: 'monthly',
    pensionBasis: DEFAULT_PENSION_BASIS,
    stopsAtRetirement: true,
  }),
  gives: { money: MANY, basis: MANY },
  build(income, context) {
    const fires = context.timeline.fires(incomeSchedule(income, context));
    context.addRule(payIncome(amountOf(income), routesFrom(income, context), fires));
  },
  check(income, query) {
    const codes: DiagnosticCode[] = [];
    const out = query.outOf(income, 'money');
    const transfers = out.flatMap((next) => (next.type === 'transfer' ? [next] : []));
    if (transfers.reduce((sum, transfer) => sum + transfer.data.amount, 0) > amountOf(income)) {
      codes.push('transfersExceedIncome');
    }
    if (out.length - transfers.length > 1) codes.push('restGoesOnlyOnce');
    return codes;
  },
};
