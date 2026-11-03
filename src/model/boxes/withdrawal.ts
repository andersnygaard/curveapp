import { OUTSIDE } from '../../engine/engine';
import { drawnBy, settleGate, type Need } from '../../engine/rules';
import type { BoxSpec, CompileContext, DiagnosticCode } from '../spec';
import { MANY } from '../spec';
import { drawRank } from '../query';
import type { AccountBox, Box, FolketrygdBox, OtpBox, WithdrawalBox } from '../types';
import { taxOnGainOf } from './account';

// A flat rate for now. The full rules for pension tax are a later task.
const DEFAULT_PENSION_TAX = 24;

export type WithdrawalData = {
  name: string;
  startAge: number;
  mode: 'amount' | 'percent';
  // Kroner per month after tax, in today's money. Tax comes on top.
  perMonth: number;
  // Percent of the accounts on the first day, then the same amount every year. Before tax, so tax comes out of it.
  percent: number;
  // Percent of the pension wired in.
  pensionTax: number;
};

const pensionTaxOf = ({ data }: WithdrawalBox) => Math.min(100, Math.max(0, data.pensionTax)) / 100;

function needOf({ data }: WithdrawalBox): Need {
  return data.mode === 'amount'
    ? { perMonth: Math.max(0, data.perMonth) }
    : { yearlyShareOfAccounts: Math.max(0, data.percent) / 100 };
}

type Source = AccountBox | OtpBox | FolketrygdBox;

const isSource = (box: Box): box is Source => box.type === 'account' || box.type === 'otp' || box.type === 'folketrygd';

// Pension stacks first, since it counts first. An account can feed several gates, so its flow is per gate.
function sourcesOf(gate: WithdrawalBox, context: CompileContext) {
  const sources = context.into(gate, 'money').filter(isSource);
  return [...sources.filter((box) => box.type !== 'account'), ...sources.filter((box) => box.type === 'account')].map((box) =>
    box.type === 'account'
      ? { name: box.data.name, label: drawnBy(context.stockOf(gate), context.stockOf(box)) }
      : { name: box.data.name, label: `payout:${box.id}`, keeps: 1 - pensionTaxOf(gate) },
  );
}

// The FIRE gate. Pension wired in counts first, accounts wired in cover the rest, and any surplus flows on.
export const withdrawalSpec: BoxSpec<WithdrawalBox> = {
  defaults: (names) => ({ name: names.withdrawal, startAge: 67, mode: 'amount', perMonth: 40_000, percent: 4, pensionTax: DEFAULT_PENSION_TAX }),
  takes: { money: { max: MANY, from: ['account', 'otp', 'folketrygd'] } },
  gives: { money: 1 },
  holds: true,
  declare(gate, context) {
    const startDay = context.dayOfAge(gate.data.startAge);
    context.addStock(gate, {
      name: gate.data.name,
      unit: 'money',
      currency: 'NOK',
      opening: 0,
      openDay: 0,
      hidden: true,
      // It can only fall short once it has started, and only if that happens within the period.
      canRunOut: startDay !== null && startDay <= context.timeline.days,
    });
  },
  build(gate, context) {
    const startDay = context.dayOfAge(gate.data.startAge);
    if (startDay === null) return;
    const pulls = context
      .into(gate, 'money')
      .flatMap((box) => (box.type === 'account' ? [{ stock: context.stockOf(box), taxOnGain: taxOnGainOf(box) }] : []));
    if (startDay <= context.timeline.days) pulls.forEach(({ stock }) => context.markCanRunOut(stock));
    const overflow = context.outOf(gate, 'money')[0];
    context.addGateSources({
      gate: context.stockOf(gate),
      sources: sourcesOf(gate, context),
      surplusTo: overflow?.type === 'account' ? overflow.data.name : null,
    });
    context.addRule(
      settleGate({
        buffer: context.stockOf(gate),
        pulls,
        overflow: overflow ? context.stockOf(overflow) : OUTSIDE,
        need: needOf(gate),
        pensionTax: pensionTaxOf(gate),
        startDay,
        fires: context.timeline.fires({ every: 'monthly' }),
        rank: drawRank(gate, context),
      }),
    );
  },
  check(gate, query) {
    const codes: DiagnosticCode[] = [];
    if (query.assumptions.birthYear === null) codes.push('needsBirthYear');
    const sources = query.into(gate, 'money');
    if (sources.length === 0) codes.push('nothingToDraw');
    const takesPension = sources.some((source) => source.type !== 'account');
    if (takesPension && query.outOf(gate, 'money').length === 0) codes.push('surplusIsSpent');
    return codes;
  },
};
