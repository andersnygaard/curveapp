import { useEffect, useMemo, useState } from 'react';
import type { Translations } from '../i18n';
import { defaultGraph, inputOf } from '../model/graph';
import { renameBoxes } from '../model/names';
import { loadGraph, parseGraph, saveGraph } from '../model/storage';
import type { Graph, SimulationInput } from '../model/types';

// The setup on screen: the boxes and wires the user has drawn, kept in this browser, and replaced by a file or a reset.
export function useSetup(t: Translations) {
  const [{ graph: first, recovered }] = useState(() => loadGraph(t.defaultNames));
  const [graph, setGraph] = useState(first);
  // Counts the setups that have replaced the first one. A new setup gets a fresh canvas, so React Flow fits the new
  // boxes and no number field keeps text typed for the old one. Until then, a notice about stored boxes that could not
  // be read is still about the setup on screen.
  const [generation, setGeneration] = useState(0);
  const [unreadableFile, setUnreadableFile] = useState(false);
  const input = useSimulationInput(graph);

  useEffect(() => saveGraph(graph), [graph]);

  function replace(next: Graph) {
    setGraph(next);
    setUnreadableFile(false);
    setGeneration((count) => count + 1);
  }

  // It only asks once it knows that the file can be read, and nothing changes until the answer is yes.
  function load(text: string) {
    try {
      const loaded = parseGraph(text, t.defaultNames);
      setUnreadableFile(false);
      if (!window.confirm(t.confirmLoad)) return;
      replace(loaded);
    } catch {
      setUnreadableFile(true);
    }
  }

  function reset() {
    if (window.confirm(t.confirmReset)) replace(defaultGraph(t.defaultNames));
  }

  // A name that is only a word in the list, such as a default name, follows a change of language.
  const rename = (words: [string, string][]) => setGraph((current) => renameBoxes(current, words));

  return {
    graph,
    setGraph,
    input,
    recovered: recovered && generation === 0,
    generation,
    unreadableFile,
    dismissUnreadable: () => setUnreadableFile(false),
    load,
    reset,
    rename,
  };
}

// Moving or selecting a box leaves the input equal, so the simulation keeps running.
export function useSimulationInput(graph: Graph): SimulationInput {
  const key = JSON.stringify(inputOf(graph));
  return useMemo(() => JSON.parse(key) as SimulationInput, [key]);
}
