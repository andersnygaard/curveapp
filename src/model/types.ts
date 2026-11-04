// The drawing as plain data. Nothing here knows about React or how the boxes are shown.
import type { AccountData } from './boxes/account';
import type { BudgetData } from './boxes/budget';
import type { FolketrygdData } from './boxes/folketrygd';
import type { GData } from './boxes/g';
import type { HousingData } from './boxes/housing';
import type { IncomeData } from './boxes/income';
import type { MeData } from './boxes/me';
import type { OtpData } from './boxes/otp';
import type { ReturnData } from './boxes/returnBox';
import type { TransferData } from './boxes/transfer';
import type { WealthTaxData } from './boxes/wealthTax';
import type { WithdrawalData } from './boxes/withdrawal';

// Money moves kroner. Influence changes a value without money coming from another box. Basis only reads a number.
export type WireKind = 'money' | 'influence' | 'basis';
export const WIRE_KINDS: WireKind[] = ['money', 'influence', 'basis'];

interface BoxOf<Type extends string, Data> {
  id: string;
  type: Type;
  data: Data;
}

export type IncomeBox = BoxOf<'income', IncomeData>;
export type TransferBox = BoxOf<'transfer', TransferData>;
export type BudgetBox = BoxOf<'budget', BudgetData>;
export type AccountBox = BoxOf<'account', AccountData>;
export type ReturnBox = BoxOf<'return', ReturnData>;
export type OtpBox = BoxOf<'otp', OtpData>;
export type FolketrygdBox = BoxOf<'folketrygd', FolketrygdData>;
export type WithdrawalBox = BoxOf<'withdrawal', WithdrawalData>;
export type HousingBox = BoxOf<'housing', HousingData>;
export type WealthTaxBox = BoxOf<'wealthTax', WealthTaxData>;
export type GBox = BoxOf<'g', GData>;
export type MeBox = BoxOf<'me', MeData>;

export type Box =
  | IncomeBox
  | TransferBox
  | BudgetBox
  | AccountBox
  | ReturnBox
  | OtpBox
  | FolketrygdBox
  | WithdrawalBox
  | HousingBox
  | WealthTaxBox
  | GBox
  | MeBox;
export type BoxType = Box['type'];
export type BoxOfType<Type extends BoxType> = Extract<Box, { type: Type }>;

export interface Wire {
  id: string;
  source: string;
  target: string;
  kind: WireKind;
}

export interface XYPosition {
  x: number;
  y: number;
}

export type PlacedBox = Box & { position: XYPosition; deletable?: boolean };

// What the user drew, as it is stored and shown.
export interface Graph {
  boxes: PlacedBox[];
  wires: Wire[];
}

// What the simulation reads. Moving a box leaves this equal, so the simulation keeps running.
export interface SimulationInput {
  boxes: Box[];
  wires: Wire[];
}

export interface DefaultNames {
  income: string;
  transfer: string;
  budget: string;
  // Both a housing box and a line in a budget, so changing language has one word to go by.
  housing: string;
  budgetLiving: string;
  account: string;
  return: string;
  otp: string;
  folketrygd: string;
  withdrawal: string;
}
