import type { BoxSpec, CompileContext, DiagnosticCode, GraphQuery } from '../spec';
import { MANY } from '../spec';
import type { BudgetBox, IncomeBox } from '../types';
import { incomeEnd, paymentsPerYear, restAfterTransfers } from './pay';

export type BudgetLine = {
  id: string;
  name: string;
  // Per month.
  amount: number;
};

export type BudgetData = {
  name: string;
  lines: BudgetLine[];
};

export const spendPerMonth = (budget: BudgetBox) =>
  budget.data.lines.reduce((sum, line) => sum + Math.max(0, line.amount), 0);

const incomesInto = (budget: BudgetBox, query: GraphQuery) =>
  query.into(budget, 'money').filter((box): box is IncomeBox => box.type === 'income');

// What the incomes wired in leave per month, after their fixed transfers.
export function incomePerMonth(budget: BudgetBox, query: GraphQuery): number {
  return incomesInto(budget, query).reduce(
    (sum, income) => sum + (restAfterTransfers(income, query) * paymentsPerYear(income)) / 12,
    0,
  );
}

// The part of each payment that continues to savings. It is worked out over the year, so a quarterly income or a
// bonus saves as much as the same money paid monthly. When one income stops, the others carry the budget alone.
export function budgetShare(budget: BudgetBox, context: CompileContext): (day: number) => number {
  const spend = spendPerMonth(budget);
  const incomes = incomesInto(budget, context).map((income) => ({
    perMonth: (restAfterTransfers(income, context) * paymentsPerYear(income)) / 12,
    end: incomeEnd(income, context) ?? Infinity,
  }));
  return (day) => {
    const inflow = incomes.reduce((sum, income) => (day < income.end ? sum + income.perMonth : sum), 0);
    return inflow > 0 ? Math.max(0, 1 - spend / inflow) : 0;
  };
}

export const budgetSpec: BoxSpec<BudgetBox> = {
  defaults: (names) => ({
    name: names.budget,
    lines: [
      { id: 'housing', name: names.budgetHousing, amount: 20_000 },
      { id: 'living', name: names.budgetLiving, amount: 15_000 },
    ],
  }),
  takes: { money: { max: MANY, from: ['income'] } },
  gives: { money: 1 },
  check(budget, query) {
    const codes: DiagnosticCode[] = [];
    if (query.into(budget, 'money').length === 0 || query.outOf(budget, 'money').length === 0) codes.push('notConnected');
    if (spendPerMonth(budget) > incomePerMonth(budget, query) && query.into(budget, 'money').length > 0) {
      codes.push('budgetExceedsIncome');
    }
    return codes;
  },
};
