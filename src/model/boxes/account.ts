import { earnShield, SHIELD_DATE } from '../../engine/norway';
import { deflateDeposits } from '../../engine/rules';
import { today, validDate } from '../dates';
import type { BoxSpec, CompileContext } from '../spec';
import { MANY } from '../spec';
import type { AccountBox } from '../types';

const DEFAULT_TAX_ON_GAIN = 37.84;
const DEFAULT_INFLATION = 2.5;
// The rate Skatteetaten set for 2025. It is decided after each year, so what it will be ahead is an assumption.
const DEFAULT_SHIELD_RATE = 3.6;

export type AccountData = {
  name: string;
  startAmount: number;
  startDate: string;
  currency: string;
  accountType: 'regular' | 'ask';
  taxRate: number;
  inflation: number;
  shieldRate: number;
  // What the account has built up before the simulation starts.
  unusedShield: number;
};

// Only an ASK has tax on its gain here, and a regular account pays none when it is drawn on.
export const taxOnGainOf = ({ data }: AccountBox) => (data.accountType === 'ask' ? Math.min(100, Math.max(0, data.taxRate)) / 100 : 0);
const inflationOf = ({ data }: AccountBox) => Math.max(-50, data.inflation) / 100;

export const accountSpec: BoxSpec<AccountBox> = {
  defaults: (names) => ({
    name: names.account,
    startAmount: 100_000,
    startDate: today(),
    currency: 'NOK',
    accountType: 'regular',
    taxRate: DEFAULT_TAX_ON_GAIN,
    inflation: DEFAULT_INFLATION,
    shieldRate: DEFAULT_SHIELD_RATE,
    unusedShield: 0,
  }),
  takes: {
    money: { max: MANY, from: ['income', 'transfer', 'budget', 'otp', 'folketrygd', 'withdrawal'] },
    influence: { max: MANY, from: ['return'] },
  },
  gives: { money: MANY },
  holds: true,
  declare(account, context: CompileContext) {
    const { name, startAmount, startDate, currency, accountType } = account.data;
    context.addStock(account, {
      name,
      unit: 'money',
      currency,
      opening: Math.max(0, startAmount),
      openDay: context.timeline.dayOf(validDate(startDate)),
      taxOnGain: accountType === 'ask' ? taxOnGainOf(account) : undefined,
    });
  },
  build(account, context) {
    if (account.data.accountType !== 'ask') return;
    context.addRule(
      earnShield({
        stock: context.stockOf(account),
        annualRate: Math.max(0, account.data.shieldRate) / 100,
        annualInflation: inflationOf(account),
        opening: Math.max(0, account.data.unusedShield),
        yearEnds: context.timeline.fires({ annually: SHIELD_DATE }),
        fires: context.everyDay,
      }),
    );
    context.addRule(deflateDeposits(context.stockOf(account), inflationOf(account), context.everyDay));
  },
};
