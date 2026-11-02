import { OUTSIDE } from '../../engine/engine';
import { settleGate, type Need } from '../../engine/rules';
import type { BoxSpec, DiagnosticCode } from '../spec';
import { MANY } from '../spec';
import type { WithdrawalBox } from '../types';

export type WithdrawalData = {
  name: string;
  startAge: number;
  mode: 'amount' | 'percent';
  // Kroner per month, in today's money.
  perMonth: number;
  // Percent of the accounts on the first day, then the same amount every year.
  percent: number;
};

function needOf({ data }: WithdrawalBox): Need {
  return data.mode === 'amount'
    ? { perMonth: Math.max(0, data.perMonth) }
    : { yearlyShareOfAccounts: Math.max(0, data.percent) / 100 };
}

// The FIRE gate. Pension wired in counts first, accounts wired in cover the rest, and any surplus flows on.
export const withdrawalSpec: BoxSpec<WithdrawalBox> = {
  defaults: (names) => ({ name: names.withdrawal, startAge: 67, mode: 'amount', perMonth: 40_000, percent: 4 }),
  takes: { money: { max: MANY, from: ['account', 'otp', 'folketrygd'] } },
  gives: { money: 1 },
  holds: true,
  declare(gate, context) {
    context.addStock(gate, {
      name: gate.data.name,
      unit: 'money',
      currency: 'NOK',
      opening: 0,
      openDay: 0,
      hidden: true,
      canRunOut: true,
    });
  },
  build(gate, context) {
    const startDay = context.dayOfAge(gate.data.startAge);
    if (startDay === null) return;
    const pulls = context.into(gate, 'money').flatMap((box) => (box.type === 'account' ? [context.stockOf(box)] : []));
    pulls.forEach(context.markCanRunOut);
    const overflow = context.outOf(gate, 'money')[0];
    context.addRule(
      settleGate({
        buffer: context.stockOf(gate),
        pulls,
        overflow: overflow ? context.stockOf(overflow) : OUTSIDE,
        need: needOf(gate),
        startDay,
        fires: context.timeline.fires({ every: 'monthly' }),
      }),
    );
  },
  check(gate, query) {
    const codes: DiagnosticCode[] = [];
    if (query.assumptions.birthYear === null) codes.push('needsBirthYear');
    if (query.into(gate, 'money').length === 0) codes.push('nothingToDraw');
    return codes;
  },
};
