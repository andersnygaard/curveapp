// What an income pays and how long it lasts, read by the boxes that an income is wired to.
import { OUTSIDE } from '../../engine/engine';
import { taxPaidAt } from '../../engine/rules';
import type { CompileContext, GraphQuery } from '../spec';
import type { Box, FolketrygdBox, IncomeBox, OtpBox } from '../types';

export type IncomeInterval = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const PAYMENTS_PER_YEAR: Record<IncomeInterval, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

export const paymentsPerYear = (income: IncomeBox) => PAYMENTS_PER_YEAR[income.data.interval];
export const basisOf = (income: IncomeBox) => Math.max(0, income.data.pensionBasis);
export const amountOf = (income: IncomeBox) => Math.max(0, income.data.amount);

export function incomesOf(boxes: Box[]): IncomeBox[] {
  return boxes.filter((box): box is IncomeBox => box.type === 'income');
}

// The flow an income's payments to a box are recorded under.
export const incomeLabel = (income: IncomeBox, target: Box) => `${income.id}:${target.id}`;

// The first day with this income and the first day without it. An empty age leaves that end open, and so does an age
// without a birth year to count from.
function incomePeriod({ data }: IncomeBox, context: CompileContext) {
  const dayOf = (age: number | null) => (age === null ? undefined : (context.dayOfAge(age) ?? undefined));
  return { from: dayOf(data.fromAge), until: dayOf(data.toAge) };
}

export const incomeSchedule = (income: IncomeBox, context: CompileContext) => ({
  every: income.data.interval,
  ...incomePeriod(income, context),
});

export function incomeRuns(income: IncomeBox, context: CompileContext): (day: number) => boolean {
  const { from = -Infinity, until = Infinity } = incomePeriod(income, context);
  return (day) => day >= from && day < until;
}

// The pension basis of the incomes that run on a given day.
export function salaryFrom(boxes: Box[], context: CompileContext): (day: number) => number {
  const incomes = incomesOf(boxes).map((income) => ({ basis: basisOf(income), runs: incomeRuns(income, context) }));
  return (day) => incomes.reduce((sum, income) => (income.runs(day) ? sum + income.basis : sum), 0);
}

// Tax on pension is per person and not per box, so a pension only says what it pays under and where the money goes.
export function addTaxedPension(pension: OtpBox | FolketrygdBox, label: string, context: CompileContext) {
  const target = context.outOf(pension, 'money')[0];
  context.addPension({
    label,
    to: target ? context.stockOf(target) : OUTSIDE,
    taxShownAs: target?.type === 'withdrawal' ? taxPaidAt(context.stockOf(target)) : undefined,
    givesCredit: pension.type === 'folketrygd',
  });
}

// What a payment has left after the fixed transfers.
export function restAfterTransfers(income: IncomeBox, query: GraphQuery): number {
  const transfers = query.outOf(income, 'money').flatMap((next) => (next.type === 'transfer' ? [next] : []));
  return Math.max(0, amountOf(income) - transfers.reduce((sum, transfer) => sum + transfer.data.amount, 0));
}
