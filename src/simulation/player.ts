import type { Layout, SimulationFrame } from '../engine/simulate';
import type { Summary } from '../engine/statistics';

const PASS_DURATION_MS = 5000;

export type Pass = Float64Array[];

// Plays the passes one by one. New frames bring a sharper summary and more passes to play.
export class Player {
  readonly layout: Layout;
  // The years these passes cover, which the text on screen must match while a new run is on its way.
  readonly years: number;
  summary: Summary;
  current: Pass;
  progress = 0;
  completed = 0;
  private readonly passes: Pass[] = [];
  private elapsed = 0;

  constructor(layout: Layout, years: number, frame: SimulationFrame) {
    this.layout = layout;
    this.years = years;
    this.summary = frame.summary;
    this.passes.push(...frame.passes);
    this.current = this.passes[0];
  }

  // All the passes that have come in, also those not played yet.
  get arrived(): readonly Pass[] {
    return this.passes;
  }

  receive(frame: SimulationFrame) {
    this.summary = frame.summary;
    this.passes.push(...frame.passes);
  }

  // Returns true when a pass finished, which is when the number on screen changes.
  advance(ms: number, reducedMotion: boolean): boolean {
    this.elapsed += ms;
    const finished = this.elapsed >= PASS_DURATION_MS;
    if (finished) {
      this.completed++;
      this.current = this.passes[this.completed % this.passes.length];
      this.elapsed -= PASS_DURATION_MS;
    }
    this.progress = reducedMotion ? 1 : this.elapsed / PASS_DURATION_MS;
    return finished;
  }
}
