import { useState } from 'react';
import { DEFAULT_YEARS, hasStocks, LAST_AGE, yearsToAge } from '../model/compile';
import { assumptionsOf } from '../model/query';
import type { SimulationInput } from '../model/types';
import { yearsOf, type Horizon } from './horizon';
import SimulationView from './SimulationView';
import { useDrawLoop } from './useDrawLoop';
import { useSimulation } from './useSimulation';

interface Props {
  active: boolean;
  input: SimulationInput;
}

// Runs the simulation and plays it. What it looks like is up to SimulationView.
export default function SimulationTab({ active, input }: Props) {
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_YEARS);
  const [paused, setPaused] = useState(false);

  // Edits in the Input tab take effect on the way back here, so typing never starts a new simulation.
  const [applied, setApplied] = useState(input);
  if (active && applied !== input) setApplied(input);

  const { birthYear } = assumptionsOf(applied.boxes);
  const yearsToLastAge = yearsToAge(applied, LAST_AGE);

  const { player, revision, failed } = useSimulation(applied, yearsOf(horizon, yearsToLastAge));
  const registerDraw = useDrawLoop(player, active && !paused, revision);

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
