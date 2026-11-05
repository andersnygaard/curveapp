// Where everything in the withdrawals chart goes: the stacked layers, the need, and the names written into the bands.
// Plain numbers in and points, paths and places out, so it can be tested without drawing anything.
import { MARGIN } from './chartAxis';

const LAST_SLOT = 7;
// Half the width of the step between two years. It is short, so a stop does not look like a slow decline.
const STEP_HALF_WIDTH = 5;
const STEP_PARTS = 6;
const LABEL_HEIGHT = 20;
const LABEL_CHARACTER_WIDTH = 7;
const LABEL_PADDING = 10;
const NEED_LABEL_ROOM = 120;
const MIN_EDGE_HEIGHT = 0.25;
// A band thinner than this cannot be seen, so it is not explained either.
const VISIBLE_HEIGHT = 1;

export interface Source {
  name: string;
  // The place among the boxes wired in, so a box keeps its colour when another one stops paying.
  slot: number;
  perMonth: ArrayLike<number>;
}

export type Point = [number, number];

export interface Place {
  x: number;
  y: number;
}

// There are eight colours, and a ninth box does not get a colour of its own. The rest are added up.
export function foldedSources(sources: Source[], other: string): Source[] {
  const rest = sources.filter((source) => source.slot >= LAST_SLOT);
  if (rest.length < 2) return sources;
  const perMonth = Array.from(rest[0].perMonth, (_, year) => rest.reduce((sum, source) => sum + source.perMonth[year], 0));
  return [...sources.filter((source) => source.slot < LAST_SLOT), { name: other, slot: LAST_SLOT, perMonth }];
}

const smoothStep = (part: number) => part * part * (3 - 2 * part);

// Flat through each calendar year, with a short and soft step to the next. Every outline has its points at the same
// places, so one stacked on another stays on top of it the whole way and the two can be compared point by point.
export function outline(values: ArrayLike<number>, edges: number[], toY: (value: number) => number): Point[] {
  const points: Point[] = [[edges[0], toY(values[0])]];
  for (let year = 1; year < values.length; year++) {
    const [before, now] = [values[year - 1], values[year]];
    const half = Math.min(STEP_HALF_WIDTH, (edges[year] - edges[year - 1]) / 2, (edges[year + 1] - edges[year]) / 2);
    for (let part = 0; part <= STEP_PARTS; part++) {
      const share = part / STEP_PARTS;
      points.push([edges[year] - half + 2 * half * share, toY(before + (now - before) * smoothStep(share))]);
    }
  }
  points.push([edges[values.length], toY(values[values.length - 1])]);
  return points;
}

export const pathOf = (points: Point[]) =>
  points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

export const areaOf = (upper: Point[], lower: Point[]) => `${pathOf([...upper, ...[...lower].reverse()])}Z`;

// The line along the top of a layer, only where it has any height, so a box that is not paying draws nothing.
export function edgeOf(upper: Point[], lower: Point[]): string {
  const hasHeight = (index: number) => index >= 0 && index < upper.length && lower[index][1] - upper[index][1] > MIN_EDGE_HEIGHT;
  let path = '';
  let drawing = false;
  upper.forEach(([x, y], index) => {
    if (!hasHeight(index - 1) && !hasHeight(index) && !hasHeight(index + 1)) {
      drawing = false;
      return;
    }
    path += `${drawing ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    drawing = true;
  });
  return path;
}

// A name goes where the band is widest and still tall enough for it. Null when it fits nowhere, and then the legend has it.
export function placeInBand(name: string, upper: number[], lower: number[], edges: number[]): Place | null {
  const wanted = name.length * LABEL_CHARACTER_WIDTH + LABEL_PADDING;
  let best: { width: number; x: number; y: number } | null = null;
  for (let from = 0; from < upper.length; from++) {
    let [top, bottom] = [-Infinity, Infinity];
    for (let to = from; to < upper.length; to++) {
      // Screen coordinates, so the top of a band is its smallest number.
      top = Math.max(top, upper[to]);
      bottom = Math.min(bottom, lower[to]);
      if (bottom - top < LABEL_HEIGHT) break;
      const width = edges[to + 1] - edges[from];
      if (width >= wanted && (!best || width > best.width)) {
        best = { width, x: (edges[from] + edges[to + 1]) / 2, y: (top + bottom) / 2 };
      }
    }
  }
  return best && { x: best.x, y: best.y };
}

// What pays and what has to be paid, in kroner a month, with one value for each year.
export interface Flows {
  sources: Source[];
  need: ArrayLike<number>;
  tax: ArrayLike<number>;
  wealthTax: ArrayLike<number>;
}

// Where the years and the amounts are on screen. The edges are where each year begins, and last where the final one ends.
export interface Scale {
  edges: number[];
  toY: (value: number) => number;
  yMax: number;
  plotHeight: number;
}

// The names written into the bands. How long they are decides where they fit.
export interface BandNames {
  surplus: string;
  short: string;
  tax: string;
}

export interface Band {
  area: string;
  place: Place | null;
}

export interface Layer extends Source {
  area: string;
  edge: string;
  place: Place | null;
}

export interface Stack {
  layers: Layer[];
  // Above the need, below it up to the need, and the tax on top of it all. Null where there is nothing to see.
  surplus: Band | null;
  short: Band | null;
  tax: Band | null;
  // The line for the need from the first year that has one, and where its label goes. Null when nothing is needed.
  need: { path: string; label: Place & { anchor: 'start' | 'end' } } | null;
}

export function stackOf({ sources, need, tax, wealthTax }: Flows, { edges, toY, yMax, plotHeight }: Scale, names: BandNames): Stack {
  // Each source starts where the one below it ends.
  const tops: number[][] = [];
  sources.forEach((source, layer) => {
    tops.push(Array.from(source.perMonth, (value, year) => value + (layer > 0 ? tops[layer - 1][year] : 0)));
  });
  const nothing = Array.from({ length: need.length }, () => 0);
  const paid = tops.at(-1) ?? nothing;
  const needs = Array.from(need);
  const aboveNeed = paid.map((value, year) => Math.max(value, needs[year]));
  const belowNeed = paid.map((value, year) => Math.min(value, needs[year]));
  const withTax = aboveNeed.map((value, year) => value + tax[year] + wealthTax[year]);
  const isVisible = (amount: number) => (amount / yMax) * plotHeight >= VISIBLE_HEIGHT;
  const upToNeed = (values: number[]) => values.map((value, year) => toY(Math.min(value, needs[year])));
  const band = (seen: boolean, name: string, upper: number[], lower: number[]): Band | null =>
    seen
      ? {
          area: areaOf(outline(upper, edges, toY), outline(lower, edges, toY)),
          place: placeInBand(name, upper.map(toY), lower.map(toY), edges),
        }
      : null;

  const layers = sources.map((source, layer) => {
    const lower = layer > 0 ? tops[layer - 1] : nothing;
    const capped = (values: number[]) => outline(values.map((value, year) => Math.min(value, needs[year])), edges, toY);
    return {
      ...source,
      area: areaOf(outline(tops[layer], edges, toY), outline(lower, edges, toY)),
      // What goes beyond the need is greyed out, so only what is under it gets a line in its colour.
      edge: edgeOf(capped(tops[layer]), capped(lower)),
      // Under the need if there is room, where it has the colour to itself and not the hatching.
      place:
        placeInBand(source.name, upToNeed(tops[layer]), upToNeed(lower), edges) ??
        placeInBand(source.name, tops[layer].map(toY), lower.map(toY), edges),
    };
  });

  return {
    layers,
    surplus: band(aboveNeed.some((value, year) => isVisible(value - needs[year])), names.surplus, aboveNeed, needs),
    short: band(belowNeed.some((value, year) => isVisible(needs[year] - value)), names.short, needs, belowNeed),
    tax: band(withTax.some((value, year) => isVisible(value - aboveNeed[year])), names.tax, withTax, aboveNeed),
    need: needLineOf(needs, edges, toY),
  };
}

// Left of where the need starts if there is room for the label there, and otherwise just above the line.
function needLineOf(needs: number[], edges: number[], toY: (value: number) => number): Stack['need'] {
  const from = needs.findIndex((value) => value > 0);
  if (from < 0) return null;
  const path = pathOf(outline(needs.slice(from), edges.slice(from), toY));
  const y = toY(Math.max(...needs));
  return edges[from] - MARGIN.left > NEED_LABEL_ROOM
    ? { path, label: { x: edges[from] - 8, y, anchor: 'end' } }
    : { path, label: { x: edges[from] + 8, y: y - 9, anchor: 'start' } };
}
