// What every box shares and no box owns: one path for G, and one tax on all pensions together, since tax is per person.
// The G box and the box for yourself need not be in what is compiled, so this does not hang on either of them.
import { G, G_REGULATION_DATE, nextG, PENSION_TAX_RATE, taxPensions, type TaxedPension } from '../engine/norway';
import { stepFactor } from '../engine/rules';
import { specOf } from './catalog';
import type { BuildContext, DeclareContext } from './spec';
import type { Box, SimulationInput } from './types';

// Before the boxes. G is random, so it is only set up when a box needs it, and without it one pass can say it all.
export function declareShared({ boxes }: SimulationInput, context: DeclareContext) {
  const needsG = (box: Box) => specOf(box).readsG === true && (specOf(box).usesG?.(box, context) ?? true);
  if (boxes.some(needsG)) {
    const { value, growth, volatility } = context.assumptions.g;
    const regulated = context.timeline.fires({ annually: G_REGULATION_DATE, from: 1 });
    // G before the start is unknown and is estimated from the expected growth.
    context.addFactor({ id: G, value, previous: value / (1 + growth) }, volatility > 0);
    context.addRule(stepFactor(G, regulated, nextG(growth, volatility)));
  }
  // A factor only in shape, which never takes a step. taxPensions sets it in the payout phase and settleGate reads it in
  // the draw phase the same day, so it carries this month's rate from one rule to the other. settleGate cannot do
  // without it, so it is always there.
  context.addFactor({ id: PENSION_TAX_RATE, value: 0, previous: 0 }, false);
}

// After the boxes, once every pension has said what it pays and where its money goes.
export function buildShared(pensions: TaxedPension[], context: BuildContext) {
  if (pensions.length === 0) return;
  const { timeline } = context;
  context.addRule(taxPensions(pensions, (day) => timeline.yearIndex(day), timeline.fires({ every: 'monthly' })));
}
