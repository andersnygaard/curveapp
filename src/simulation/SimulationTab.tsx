import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_YEARS, hasStocks, LAST_AGE, yearsToAge } from '../model/compile';
import { assumptionsOf } from '../model/query';
import type { SimulationInput } from '../model/types';
import SimulationView, { yearsOf, type Horizon } from './SimulationView';
import { useSimulation } from './useSimulation';

const MAX_FRAME_MS = 100;

interface Props {
  active: boolean;
  input: SimulationInput;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Runs the simulation and plays it. What it looks like is up to SimulationView.
export default function SimulationTab({ active, input }: Props) {
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_YEARS);
  const [paused, setPaused] = useState(false);
  const [, setPassesPlayed] = useState(0);

  // Edits in the Input tab take effect on the way back here, so typing never starts a new simulation.
  const [applied, setApplied] = useState(input);
  if (active && applied !== input) setApplied(input);

  const { birthYear } = assumptionsOf(applied.boxes);
  const yearsToLastAge = yearsToAge(applied, LAST_AGE);

  const { player, revision, failed } = useSimulation(applied, yearsOf(horizon, yearsToLastAge));

  const drawers = useRef(new Set<() => void>());
  const registerDraw = useCallback((draw: () => void) => {
    drawers.current.add(draw);
    return () => {
      drawers.current.delete(draw);
    };
  }, []);

  useEffect(() => {
    if (!active || paused || !player) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = Math.max(0, Math.min(now - last, MAX_FRAME_MS));
      last = now;
      if (player.advance(elapsed, reducedMotion())) setPassesPlayed(player.completed);
      drawers.current.forEach((draw) => draw());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, paused, player]);

  // The median gets sharper in the background, also while paused.
  useEffect(() => drawers.current.forEach((draw) => draw()), [revision]);

  return (
    <SimulationView
      hasAccounts={hasStocks(applied)}
      failed={failed}
      player={player}
      birthYear={birthYear}
      yearsToLastAge={yearsToLastAge}
      horizon={horizon}
      onHorizon={setHorizon}
      paused={paused}
      onTogglePause={() => setPaused(!paused)}
      registerDraw={registerDraw}
    />
  );
}
