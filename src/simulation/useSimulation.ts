import { useEffect, useState } from 'react';
import { hasStocks } from '../model/compile';
import type { SimulationInput } from '../model/types';
import { Player } from './player';
import type { SimulationRequest, SimulationUpdate } from './protocol';

// Starts a simulation thread for each new input. The old picture stays until the new one is ready, so nothing flickers.
export function useSimulation(input: SimulationInput, years: number) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!hasStocks(input)) {
      setPlayer(null);
      return;
    }
    const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
    let running: Player | null = null;
    worker.onmessage = ({ data }: MessageEvent<SimulationUpdate>) => {
      if (running) {
        running.receive(data);
        setRevision((value) => value + 1);
      } else {
        running = new Player(data.layout, years, data);
        setPlayer(running);
      }
    };
    worker.onerror = () => setFailed(true);
    worker.postMessage({ input, years } satisfies SimulationRequest);
    return () => worker.terminate();
  }, [input, years]);

  return { player, revision, failed };
}
