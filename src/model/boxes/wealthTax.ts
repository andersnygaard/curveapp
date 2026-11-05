import { payWealthTax, WEALTH_DATE } from '../../engine/norway';
import type { BoxSpec } from '../spec';
import type { WealthTaxBox } from '../types';
import { taxOnGainOf } from './account';
import { loanOn, valueOf } from './housing';

// The rates adopted for 2026. Those for 2027 are only a proposal so far.
const DEFAULT_ALLOWANCE = 1_900_000;
const DEFAULT_RATE = 1;
const DEFAULT_HIGH_FROM = 21_500_000;
const DEFAULT_HIGH_RATE = 1.1;

export type WealthTaxData = {
  allowance: number;
  // In percent, the second one on what is above highFrom.
  rate: number;
  highFrom: number;
  highRate: number;
};

// It counts all accounts and homes, so there is nothing to choose and it has no wires. OTP and the old-age pension stay out.
// A box and not a setting, since deleting it is how the tax is turned off: a setup without it gives the same as before.
export const wealthTaxSpec: BoxSpec<WealthTaxBox> = {
  defaults: () => ({ allowance: DEFAULT_ALLOWANCE, rate: DEFAULT_RATE, highFrom: DEFAULT_HIGH_FROM, highRate: DEFAULT_HIGH_RATE }),
  onlyOne: true,
  build(box, context) {
    if (context.allOf('wealthTax')[0].id !== box.id) return;
    const accounts = context.allOf('account');
    const homes = context.allOf('housing');
    const { allowance, rate, highFrom, highRate } = box.data;
    // Without a home the tax is a small part of what the accounts hold, so it can only fall short when there is one.
    if (homes.length > 0) for (const account of accounts) context.markMayFallShort(context.stockOf(account));
    context.addRule(
      payWealthTax({
        rates: {
          allowance: Math.max(0, allowance),
          rate: Math.max(0, rate) / 100,
          highFrom: Math.max(0, highFrom),
          highRate: Math.max(0, highRate) / 100,
        },
        accounts: accounts.map((account) => ({
          stock: context.stockOf(account),
          holdsFunds: account.data.accountType === 'ask',
          taxOnGain: taxOnGainOf(account),
        })),
        homes: homes.map((home) => {
          const paidOffDay = context.timeline.dayOf(home.data.paidOff);
          return { kind: home.data.kind, value: valueOf(home), loanOn: (day: number) => loanOn(home, day, paidOffDay) };
        }),
        fires: context.timeline.fires({ annually: WEALTH_DATE }),
      }),
    );
  },
};
