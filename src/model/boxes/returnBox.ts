import { earnReturn, marketStep, stepFactor } from '../../engine/rules';
import { yearsSinceLast } from '../../engine/timeline';
import type { BoxSpec, Compiling, DiagnosticCode } from '../spec';
import { MANY } from '../spec';
import type { ReturnBox } from '../types';
import { shareOf } from '../values';

export type ReturnInterval = 'daily' | 'tradingDays' | 'monthly' | 'yearly';

export type ReturnData = {
  name: string;
  // In today's money, so above inflation.
  annualReturn: number;
  returnInterval: ReturnInterval;
  standardDeviation: number;
};

export const annualRateOf = ({ data }: ReturnBox) => shareOf(data.annualReturn, -99);

// Income arrives on the first day of a period, while monthly and yearly returns are paid on the last.
function payDays({ data }: ReturnBox, context: Compiling): Uint8Array {
  const paidOnLastDay = data.returnInterval === 'monthly' || data.returnInterval === 'yearly';
  return context.timeline.fires({ every: data.returnInterval, at: paidOnLastDay ? 'periodEnd' : 'periodStart' });
}

// A return box is a market. Accounts wired to the same box follow the same market, so the wire is the correlation.
export const returnSpec: BoxSpec<ReturnBox> = {
  defaults: (names) => ({ name: names.return, annualReturn: 4, returnInterval: 'tradingDays', standardDeviation: 15 }),
  gives: { influence: MANY },
  declare(market, context) {
    const volatility = shareOf(market.data.standardDeviation);
    const fires = payDays(market, context);
    context.addFactor({ id: market.id, value: 1, previous: 1 }, volatility > 0);
    context.addRule(stepFactor(market.id, fires, marketStep(volatility, yearsSinceLast(fires))));
  },
  build(market, context) {
    const fires = payDays(market, context);
    for (const target of context.outOf(market, 'influence')) {
      context.addRule(earnReturn(context.stockOf(target), annualRateOf(market), market.id, fires, context.everyDay));
    }
  },
  check(market, query): DiagnosticCode[] {
    return query.outOf(market, 'influence').length > 0 ? [] : ['notConnected'];
  },
};
