import { useEffect, useState } from 'react';
import type { Plan } from '../model/plan';
import type { SimulationInput } from '../model/types';
import type { PlanRequest, PlanUpdate } from './protocol';

// Long enough that typing an amount only works out the plan once.
const WAIT_AFTER_EDIT_MS = 250;

// The old plan stays until the new one is ready, so nothing flickers while drawing.
export function usePlan(input: SimulationInput) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let worker: Worker | undefined;
    const timer = setTimeout(() => {
      worker = new Worker(new URL('./plan.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<PlanUpdate>) => {
        setFailed(false);
        setPlan(data);
      };
      worker.onerror = () => setFailed(true);
      worker.postMessage({ input } satisfies PlanRequest);
    }, WAIT_AFTER_EDIT_MS);
    return () => {
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [input]);

  return { plan, failed };
}
