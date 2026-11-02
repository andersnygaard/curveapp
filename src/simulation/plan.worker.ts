// Works out the plan away from the screen, where all money is calculated.
import { planOf } from '../model/plan';
import type { PlanRequest, PlanUpdate } from './protocol';

self.onmessage = ({ data }: MessageEvent<PlanRequest>) => {
  self.postMessage(planOf(data.input) satisfies PlanUpdate);
};
