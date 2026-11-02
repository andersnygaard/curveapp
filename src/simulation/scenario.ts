export type IncomeInterval = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type ReturnInterval = 'daily' | 'tradingDays' | 'monthly' | 'yearly';
export type Interval = IncomeInterval | ReturnInterval;

export interface PensionSavings {
  lowRate: number;
  highRate: number;
  incomeIds: string[];
}

export interface AskTax {
  taxRate: number;
  inflation: number;
}

export interface Account {
  id: string;
  name: string;
  startAmount: number;
  startDate: string;
  currency: string;
  annualRate: number;
  returnInterval: ReturnInterval;
  volatility: number;
  pensionSavings?: PensionSavings;
  ask?: AskTax;
}

export interface Income {
  id: string;
  name: string;
  amount: number;
  interval: IncomeInterval;
}

export interface Transfer {
  id: string;
  name: string;
  amount: number;
  incomeId: string;
  accountId: string;
}

export interface Pension {
  id: string;
  name: string;
  startAmount: number;
  startDate: string;
  currency: string;
  incomeIds: string[];
}

export interface BaseAmount {
  value: number;
  growth: number;
  volatility: number;
}

export interface Scenario {
  accounts: Account[];
  incomes: Income[];
  transfers: Transfer[];
  pensions: Pension[];
  g: BaseAmount;
  birthYear: number | null;
}
