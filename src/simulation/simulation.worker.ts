// Runs the simulation away from the screen, so a large scenario never makes the page wait.
import { layoutOf, simulate } from '../engine/simulate';
import { compile } from '../model/compile';
import type { SimulationRequest, SimulationUpdate } from './protocol';

self.onmessage = ({ data }: MessageEvent<SimulationRequest>) => {
  const model = compile(data.input, data.years);
  const layout = layoutOf(model);
  for (const frame of simulate(model)) {
    const update: SimulationUpdate = { layout, ...frame };
    self.postMessage(update);
  }
};
