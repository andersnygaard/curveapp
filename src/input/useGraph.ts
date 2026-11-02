import { useEffect, useMemo, useState } from 'react';
import { inputOf } from '../model/graph';
import { loadGraph, saveGraph } from '../model/storage';
import type { DefaultNames, Graph, SimulationInput } from '../model/types';

export function useGraph(names: DefaultNames) {
  const [{ graph: first, recovered }] = useState(() => loadGraph(names));
  const [graph, setGraph] = useState(first);

  useEffect(() => saveGraph(graph), [graph]);

  return { graph, setGraph, recovered };
}

// Moving or selecting a box leaves the input equal, so the simulation keeps running.
export function useSimulationInput(graph: Graph): SimulationInput {
  const key = JSON.stringify(inputOf(graph));
  return useMemo(() => JSON.parse(key) as SimulationInput, [key]);
}
