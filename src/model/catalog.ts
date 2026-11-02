// Every box type in one list. A new type is a new file under boxes/ and a line here. The engine, the connection
// rules and the compiler do not change.
import { accountSpec } from './boxes/account';
import { budgetSpec } from './boxes/budget';
import { folketrygdSpec } from './boxes/folketrygd';
import { gSpec } from './boxes/g';
import { incomeSpec } from './boxes/income';
import { meSpec } from './boxes/me';
import { otpSpec } from './boxes/otp';
import { returnSpec } from './boxes/returnBox';
import { summarySpec } from './boxes/summary';
import { transferSpec } from './boxes/transfer';
import { withdrawalSpec } from './boxes/withdrawal';
import type { BoxSpec } from './spec';
import type { Box, BoxOfType, BoxType } from './types';

export const catalog: { [Type in BoxType]: BoxSpec<BoxOfType<Type>> } = {
  income: incomeSpec,
  transfer: transferSpec,
  budget: budgetSpec,
  account: accountSpec,
  return: returnSpec,
  otp: otpSpec,
  folketrygd: folketrygdSpec,
  withdrawal: withdrawalSpec,
  g: gSpec,
  me: meSpec,
  summary: summarySpec,
};

export const BOX_TYPES = Object.keys(catalog) as BoxType[];

// The boxes the toolbar can add, in the order money moves through them.
export const ADDABLE_TYPES = [
  'income',
  'transfer',
  'budget',
  'account',
  'return',
  'otp',
  'folketrygd',
  'withdrawal',
  'summary',
] as const satisfies readonly BoxType[];
export type AddableType = (typeof ADDABLE_TYPES)[number];

// TypeScript cannot see that a box and its spec belong together, so the one cast lives here.
export function specOf<B extends Box>(box: B): BoxSpec<B> {
  return catalog[box.type] as unknown as BoxSpec<B>;
}
