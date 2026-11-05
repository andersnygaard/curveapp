import type { BoxSpec } from '../spec';
import type { GBox } from '../types';
import { shareOf } from '../values';

// G from 1 May 2026.
const CURRENT_G = 136_549;
// In today's money G grows with real wages, and expected real wage growth is left to the user.
const DEFAULT_G_GROWTH = 0;
const DEFAULT_G_DEVIATION = 1;

export type GData = {
  g: number;
  gGrowth: number;
  standardDeviation: number;
};

export function assumedG({ g, gGrowth, standardDeviation }: GData) {
  return {
    value: Math.max(1, g),
    growth: shareOf(gGrowth, -50),
    volatility: shareOf(standardDeviation),
  };
}

export const gDefaults = (): GData => ({ g: CURRENT_G, gGrowth: DEFAULT_G_GROWTH, standardDeviation: DEFAULT_G_DEVIATION });

// There is one G, so a wire from it could never point anywhere else. It has no wires and appears when something reads it.
export const gSpec: BoxSpec<GBox> = {
  defaults: gDefaults,
  fixed: true,
};
