import { moveBetween } from '../../engine/rules';
import type { Interval } from '../../engine/timeline';
import type { BoxSpec, DiagnosticCode } from '../spec';
import type { Box, TransferBox } from '../types';

export type TransferData = {
  name: string;
  amount: number;
  // Only used when it draws from an account. From an income it follows the pay day.
  interval: Interval;
};

export const drawsFromAccount = (source: Box | undefined) => source?.type === 'account';

export const transferSpec: BoxSpec<TransferBox> = {
  defaults: (names) => ({ name: names.transfer, amount: 5_000, interval: 'monthly' }),
  takes: { money: { max: 1, from: ['income', 'account'] } },
  gives: { money: 1 },
  build(transfer, context) {
    const source = context.into(transfer, 'money')[0];
    const target = context.outOf(transfer, 'money')[0];
    if (!source || !target || !drawsFromAccount(source)) return;
    const from = context.stockOf(source);
    const fires = context.timeline.fires({ every: transfer.data.interval });
    context.markCanRunOut(from);
    context.addRule(
      moveBetween(from, context.stockOf(target), Math.max(0, transfer.data.amount), fires, transfer.data.name),
    );
  },
  check(transfer, query): DiagnosticCode[] {
    const connected = query.into(transfer, 'money').length > 0 && query.outOf(transfer, 'money').length > 0;
    return connected ? [] : ['notConnected'];
  },
};
