// What an income pays and how long it lasts, read by the boxes that an income is wired to.
import { OUTSIDE } from '../../engine/engine';
import { payoutOf, taxAt } from '../../engine/rules';
import type { BuildContext, Compiling, DiagnosticCode, GraphQuery } from '../spec';
import type { Box, FolketrygdBox, IncomeBox, OtpBox } from '../types';
import { amountOf as transferAmountOf } from './transfer';

export type IncomeInterval = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

// When an income runs depends only on the day each age begins, so the helpers below ask for nothing more.
type Ages = Pick<Compiling, 'dayOfAge'>;

const PAYMENTS_PER_YEAR: Record<IncomeInterval, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

export const paymentsPerYear = (income: IncomeBox) => PAYMENTS_PER_YEAR[income.data.interval];
export const basisOf = (income: IncomeBox) => Math.max(0, income.data.pensionBasis);
export const amountOf = (income: IncomeBox) => Math.max(0, income.data.amount);

export function incomesOf(boxes: Box[]): IncomeBox[] {
  return boxes.filter((box): box is IncomeBox => box.type === 'income');
}

// The flow an income's payments to a box are recorded under, and the income that such a flow came from.
export const incomeLabel = (income: IncomeBox, target: Box) => `${income.id}:${target.id}`;
export const incomeOfLabel = (label: string, boxes: Box[]) =>
  incomesOf(boxes).find((income) => label.startsWith(`${income.id}:`));

// The first day with this income and the first day without it. An empty age leaves that end open, and so does an age
// without a birth year to count from.
function incomePeriod({ data }: IncomeBox, ages: Ages) {
  const dayOf = (age: number | null) => (age === null ? undefined : (ages.dayOfAge(age) ?? undefined));
  return { from: dayOf(data.fromAge), until: dayOf(data.toAge) };
}

export const incomeSchedule = (income: IncomeBox, ages: Ages) => ({
  every: income.data.interval,
  ...incomePeriod(income, ages),
});

export function incomeRuns(income: IncomeBox, ages: Ages): (day: number) => boolean {
  const { from = -Infinity, until = Infinity } = incomePeriod(income, ages);
  return (day) => day >= from && day < until;
}

// The pension basis of the incomes that run on a given day.
export function salaryFrom(boxes: Box[], ages: Ages): (day: number) => number {
  const incomes = incomesOf(boxes).map((income) => ({ basis: basisOf(income), runs: incomeRuns(income, ages) }));
  return (day) => incomes.reduce((sum, income) => (income.runs(day) ? sum + income.basis : sum), 0);
}

// Tax on pension is per person and not per box, so a pension only says what it pays under, where the money goes and
// whether it gives the credit. Returns the flow to pay it under, so the payout and its tax read the same one.
export function addTaxedPension(pension: OtpBox | FolketrygdBox, givesCredit: boolean, context: BuildContext): string {
  const label = payoutOf(pension.id);
  const target = context.outOf(pension, 'money')[0];
  context.addPension({
    label,
    to: target ? context.stockOf(target) : OUTSIDE,
    taxShownAs: target?.type === 'withdrawal' ? taxAt(context.stockOf(target)) : undefined,
    givesCredit,
  });
  return label;
}

// What both pensions warn about. One paid from an age needs a birth year to count from, and one wired on needs an age to
// start paying at.
export function pensionChecks(pension: OtpBox | FolketrygdBox, query: GraphQuery): DiagnosticCode[] {
  const codes: DiagnosticCode[] = [];
  if (pension.data.payoutAge !== null && query.assumptions.birthYear === null) codes.push('needsBirthYear');
  if (pension.data.payoutAge === null && query.outOf(pension, 'money').length > 0) codes.push('needsPayoutAge');
  return codes;
}

// What the transfers wired to an income take from each payment, as a fixed amount each.
export function fixedTransfersOf(income: IncomeBox, query: GraphQuery): number {
  const transfers = query.outOf(income, 'money').flatMap((next) => (next.type === 'transfer' ? [next] : []));
  return transfers.reduce((sum, transfer) => sum + transferAmountOf(transfer), 0);
}

// What a payment has left after the fixed transfers.
export function restAfterTransfers(income: IncomeBox, query: GraphQuery): number {
  return Math.max(0, amountOf(income) - fixedTransfersOf(income, query));
}

// What an income has left a month after the fixed transfers. It is worked out over the year, so a quarterly income or a
// bonus counts as much as the same money paid monthly.
export const restPerMonth = (income: IncomeBox, query: GraphQuery) =>
  (restAfterTransfers(income, query) * paymentsPerYear(income)) / 12;
