// What an income pays and how long it lasts, read by the boxes that an income is wired to.
import type { CompileContext, GraphQuery } from '../spec';
import type { Box, IncomeBox } from '../types';

export type IncomeInterval = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const PAYMENTS_PER_YEAR: Record<IncomeInterval, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

export const paymentsPerYear = (income: IncomeBox) => PAYMENTS_PER_YEAR[income.data.interval];
export const basisOf = (income: IncomeBox) => Math.max(0, income.data.pensionBasis);
export const amountOf = (income: IncomeBox) => Math.max(0, income.data.amount);

export function incomesOf(boxes: Box[]): IncomeBox[] {
  return boxes.filter((box): box is IncomeBox => box.type === 'income');
}

// The first day without this income, or undefined if it runs through the whole period.
export function incomeEnd(income: IncomeBox, context: CompileContext): number | undefined {
  const { retirementAge } = context.assumptions;
  if (!income.data.stopsAtRetirement || retirementAge === null) return undefined;
  return context.dayOfAge(retirementAge) ?? undefined;
}

export const incomeSchedule = (income: IncomeBox, context: CompileContext) => ({
  every: income.data.interval,
  until: incomeEnd(income, context),
});

// The pension basis of the incomes that still run on a given day.
export function salaryFrom(boxes: Box[], context: CompileContext): (day: number) => number {
  const incomes = incomesOf(boxes).map((income) => ({
    basis: basisOf(income),
    end: incomeEnd(income, context) ?? Infinity,
  }));
  return (day) => incomes.reduce((sum, income) => (day < income.end ? sum + income.basis : sum), 0);
}

// What a payment has left after the fixed transfers.
export function restAfterTransfers(income: IncomeBox, query: GraphQuery): number {
  const transfers = query.outOf(income, 'money').flatMap((next) => (next.type === 'transfer' ? [next] : []));
  return Math.max(0, amountOf(income) - transfers.reduce((sum, transfer) => sum + transfer.data.amount, 0));
}
