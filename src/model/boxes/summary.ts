import { drawnFrom } from '../../engine/rules';
import type { BoxSpec, CompileContext } from '../spec';
import { MANY } from '../spec';
import type { AccountBox, Box, FolketrygdBox, OtpBox, SummaryBox } from '../types';

export type SummaryData = {
  name: string;
};

type Source = AccountBox | OtpBox | FolketrygdBox;

const isSource = (box: Box): box is Source => box.type === 'account' || box.type === 'otp' || box.type === 'folketrygd';

// An account is only drawn on through a withdrawal, and a pension paid straight into an account is only saved.
function withdrawalsOf(source: Source, context: CompileContext) {
  const { name } = source.data;
  if (source.type === 'account') return [{ name, label: drawnFrom(context.stockOf(source)) }];
  return context.outOf(source, 'money')[0]?.type === 'account' ? [] : [{ name, label: `payout:${source.id}` }];
}

// Reads the boxes wired to it and shows them together. It moves no money, so it cannot change a result.
export const summarySpec: BoxSpec<SummaryBox> = {
  defaults: (names) => ({ name: names.summary }),
  takes: { basis: { max: MANY, from: ['account', 'otp', 'folketrygd'] } },
  build(summary, context) {
    const sources = context.into(summary, 'basis').filter(isSource);
    if (sources.length === 0) return;
    context.addOverview({
      id: summary.id,
      name: summary.data.name,
      stocks: sources.map((source) => context.stockOf(source)),
      lines: sources.flatMap((source) => withdrawalsOf(source, context)),
    });
  },
  check(summary, query) {
    return query.into(summary, 'basis').length > 0 ? [] : ['notConnected'];
  },
};
