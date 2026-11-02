import type { Pass, Simulation } from './engine';

const PASS_DURATION_MS = 5000;
const KEPT_PASSES = 200;

export class Player {
  simulation: Simulation;
  history: Pass[] = [];
  current: Pass;
  progress = 0;
  completed = 0;
  private elapsed = 0;

  constructor(simulation: Simulation) {
    this.simulation = simulation;
    this.current = simulation.nextPass();
  }

  // Returns true when a pass finished, which is when the list of earlier passes changes.
  advance(ms: number): boolean {
    this.elapsed += ms;
    const finished = this.elapsed >= PASS_DURATION_MS;
    if (finished) {
      this.history.push(this.current);
      if (this.history.length > KEPT_PASSES) this.history.shift();
      this.current = this.simulation.nextPass();
      this.elapsed -= PASS_DURATION_MS;
      this.completed++;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.progress = reducedMotion ? 1 : this.elapsed / PASS_DURATION_MS;
    return finished;
  }
}
