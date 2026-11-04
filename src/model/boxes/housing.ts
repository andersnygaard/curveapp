import type { HomeKind } from '../../engine/norway';
import { yearsFromToday } from '../dates';
import type { BoxSpec } from '../spec';
import type { HousingBox } from '../types';

const DEFAULT_VALUE = 3_000_000;
const DEFAULT_LOAN = 1_500_000;
const DEFAULT_LOAN_YEARS = 25;

export type HousingData = {
  name: string;
  // Only says how much it counts in the wealth tax.
  kind: HomeKind;
  // Stays the same in today's money.
  value: number;
  // What is owed when the simulation starts. It falls evenly to nothing on the date it is paid off.
  loan: number;
  // A date, or empty if it is not known.
  paidOff: string;
};

export const valueOf = ({ data }: HousingBox) => Math.max(0, data.value);
export const loanOf = ({ data }: HousingBox) => Math.max(0, data.loan);

// What is owed on a day. A date that has passed means nothing is owed. Without a date the day is not a number, and the loan
// stays as it is.
export function loanOn(box: HousingBox, day: number, paidOffDay: number): number {
  if (paidOffDay <= 0) return 0;
  return Number.isNaN(paidOffDay) ? loanOf(box) : loanOf(box) * Math.max(0, 1 - day / paidOffDay);
}

// A home holds no money to spend and moves none, so it becomes nothing in the engine. Interest and repayments are the
// user's to put in a budget. What counts homes counts all of them, so there is nothing to choose and it has no wires.
export const housingSpec: BoxSpec<HousingBox> = {
  defaults: (names) => ({
    name: names.housing,
    kind: 'primary',
    value: DEFAULT_VALUE,
    loan: DEFAULT_LOAN,
    paidOff: yearsFromToday(DEFAULT_LOAN_YEARS),
  }),
  // You can only be registered as living in one place.
  check(home, query) {
    const primary = query.allOf('housing').filter((box) => box.data.kind === 'primary');
    return home.data.kind === 'primary' && primary.length > 1 ? ['twoPrimaryHomes'] : [];
  },
};
