import { OUTSIDE } from '../../engine/engine';
import { keptOf } from '../../engine/norway';
import { drawnAt, payoutOf, settleGate, type Need } from '../../engine/rules';
import type { BoxSpec, CompileContext, DiagnosticCode } from '../spec';
import { MANY } from '../spec';
import { drawRank } from '../query';
import type { AccountBox, Box, FolketrygdBox, IncomeBox, OtpBox, WithdrawalBox } from '../types';
import { taxOnGainOf } from './account';
import { incomeLabel } from './pay';

export type WithdrawalData = {
  name: string;
  startAge: number;
  mode: 'amount' | 'percent';
  // Kroner per month after tax, in today's money. Tax comes on top.
  perMonth: number;
  // Percent of the accounts on the first day, then the same amount every year. Before tax, so tax comes out of it.
  percent: number;
};

function needOf({ data }: WithdrawalBox): Need {
  return data.mode === 'amount'
    ? { perMonth: Math.max(0, data.perMonth) }
    : { yearlyShareOfAccounts: Math.max(0, data.percent) / 100 };
}

type Source = AccountBox | OtpBox | FolketrygdBox | IncomeBox;

// Bottom to top in the graph, whichever wire came first. The old-age pension lasts the longest, so it lies at the bottom,
// and pension and income stack before the accounts since they count first. It says nothing about who pays, so no result
// depends on it.
const STACKING: Source['type'][] = ['folketrygd', 'otp', 'income', 'account'];

const isSource = (box: Box): box is Source => (STACKING as string[]).includes(box.type);

// The flow of what a source pays after tax. An account can feed several gates, so its flow is per gate. Income is already
// after tax, so what it pays is what it moves.
function paidBy(box: Source, gate: WithdrawalBox, context: CompileContext): string {
  if (box.type === 'account') return drawnAt(context.stockOf(gate), context.stockOf(box));
  return box.type === 'income' ? incomeLabel(box, gate) : keptOf(payoutOf(box.id));
}

function sourcesOf(gate: WithdrawalBox, context: CompileContext) {
  const sources = context.into(gate, 'money').filter(isSource);
  return STACKING.flatMap((type) => sources.filter((box) => box.type === type)).map((box) => ({
    name: box.data.name,
    label: paidBy(box, gate, context),
  }));
}

// The FIRE gate. Pension and income wired in count first, accounts wired in cover the rest, and any surplus flows on.
export const withdrawalSpec: BoxSpec<WithdrawalBox> = {
  defaults: (names) => ({ name: names.withdrawal, startAge: 67, mode: 'amount', perMonth: 40_000, percent: 4 }),
  takes: { money: { max: MANY, from: ['account', 'otp', 'folketrygd', 'income'] } },
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
      mayFallShort: startDay !== null && startDay <= context.timeline.days,
    });
  },
  build(gate, context) {
    const startDay = context.dayOfAge(gate.data.startAge);
    if (startDay === null) return;
    const accounts = context
      .into(gate, 'money')
      .flatMap((box) => (box.type === 'account' ? [{ stock: context.stockOf(box), taxOnGain: taxOnGainOf(box) }] : []));
    if (startDay <= context.timeline.days) accounts.forEach(({ stock }) => context.markMayFallShort(stock));
    const surplusTo = context.outOf(gate, 'money')[0];
    context.addGateSources({
      gate: context.stockOf(gate),
      sources: sourcesOf(gate, context),
      surplusTo: surplusTo?.type === 'account' ? surplusTo.data.name : null,
    });
    context.addRule(
      settleGate({
        gate: context.stockOf(gate),
        accounts,
        surplusTo: surplusTo ? context.stockOf(surplusTo) : OUTSIDE,
        need: needOf(gate),
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
    const isPaidInto = sources.some((source) => source.type !== 'account');
    if (isPaidInto && query.outOf(gate, 'money').length === 0) codes.push('surplusIsSpent');
    return codes;
  },
};
