import type { BoxSpec } from '../spec';
import type { MeBox } from '../types';

export type MeData = {
  // 0 means not filled in. The birth year stays in the browser and never goes in the code.
  birthYear: number;
  // Empty means working through the whole period.
  retirementAge: number | null;
};

export function validBirthYear(year: number): number | null {
  return Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear() ? year : null;
}

export const meSpec: BoxSpec<MeBox> = {
  defaults: () => ({ birthYear: 0, retirementAge: null }),
  fixed: true,
  check(me, query) {
    return me.data.retirementAge !== null && query.assumptions.birthYear === null ? ['needsBirthYear'] : [];
  },
};
