// Runs a model pass by pass and reports back in stages, so the first picture comes quickly and then gets sharper.
import { runPass, type Model, type PassResult } from './engine';
import { passNoise, seededRandom } from './random';
import { summarize, type Summary } from './statistics';

// Passes come in pairs, so every stage must be an even number.
export const PASS_STAGES = [200, 1000, 2000];
const PLAYBACK_PASSES = 500;

export interface Layout {
  startMs: number;
  totalDays: number;
  sampleDays: number[];
}

export interface SimulationFrame {
  summary: Summary;
  // New passes to play, one series per line in the summary. Later frames bring more until there are enough.
  passes: Float64Array[][];
}

export function layoutOf({ timeline, sampleDays }: Model): Layout {
  return { startMs: timeline.startMs, totalDays: timeline.days, sampleDays };
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export function* simulate(model: Model, stages: number[] = PASS_STAGES): Generator<SimulationFrame> {
  // With nothing random every pass is the same, so two of them say it all.
  const targets = model.random ? stages : [2];
  const results: PassResult[] = [];
  const random = seededRandom(1);
  let played = 0;
  let summary: Summary | undefined;

  for (const target of targets) {
    const fresh: PassResult[] = [];
    // A pass depends only on its pair, so the first 200 of 2 000 passes are the 200 shown first.
    for (let pair = results.length / 2; pair < target / 2; pair++) {
      fresh.push(runPass(model, passNoise(pair, 1)), runPass(model, passNoise(pair, -1)));
    }
    results.push(...fresh);
    summary = summarize(model, results, summary);

    // A pass and its opposite should not follow each other on screen.
    shuffle(fresh, random);
    const passes = fresh.slice(0, Math.max(0, PLAYBACK_PASSES - played)).map((result) => result.series);
    played += passes.length;
    yield { summary, passes };
  }
}
