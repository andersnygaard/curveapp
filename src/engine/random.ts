// Hands each factor its own stream of random shocks. The streams are seeded, which gives two things:
// A scenario shows the same numbers every time it is opened, and changing a withdrawal keeps the same markets,
// so the difference on screen comes from the change and not from different luck.
export type NoiseSource = (factorId: string) => () => number;

export const noNoise: NoiseSource = () => () => 0;

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return hash >>> 0;
}

export function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

// The two passes of a pair get opposite shocks. Both are possible outcomes, and together they spread evenly
// around the middle, so the median settles with far fewer passes.
export function passNoise(pair: number, sign: 1 | -1): NoiseSource {
  return (factorId) => {
    const random = seededRandom(hashText(factorId) + pair * 0x9e3779b9);
    return () => sign * gaussian(random);
  };
}
