// Boxes in local storage. The only file in the model that touches the browser.
import { BOX_TYPES, catalog } from './catalog';
import { defaultGraph, settled } from './graph';
import { fromVersion1, fromVersion2, fromVersion3, fromVersion4, fromVersion5, fromVersion6, type Version1, type Version2 } from './migrations';
import type { DefaultNames, Graph, PlacedBox, Wire } from './types';

const STORAGE_KEY = 'curve.boxes';
const BACKUP_KEY = 'curve.boxes.backup';
export const VERSION = 7;

type Stored = { version?: number; boxes?: PlacedBox[]; wires?: Wire[] };

// A box saved before a field existed gets its default, so nothing has to check for missing fields. Null stays only
// where it means something, such as no payout age or an income that runs through the whole period.
function withDefaults(box: PlacedBox, names: DefaultNames): PlacedBox {
  const spec = catalog[box.type];
  const defaults: Record<string, unknown> = spec.defaults(names);
  const mayBeEmpty: string[] = spec.mayBeEmpty ?? [];
  const stored = Object.entries(box.data).filter(([key, value]) => value !== null || defaults[key] === null || mayBeEmpty.includes(key));
  const data = { ...defaults, ...Object.fromEntries(stored) };
  const position = box.position ?? { x: 0, y: 0 };
  return { ...box, position, data, ...(spec.fixed ? { deletable: false } : {}) } as PlacedBox;
}

// Every field filled in, and the drawing settled.
function normalize({ boxes, wires }: Version2, names: DefaultNames): Graph {
  return settled({ boxes: boxes.map((box) => withDefaults(box, names)), wires }, names);
}

// The step that takes a file from each version to the next. A file can skip many versions, so a step is never deleted,
// and a new version is a new step here.
const STEPS: Record<number, (graph: Version2) => Version2> = {
  2: fromVersion2,
  3: fromVersion3,
  4: fromVersion4,
  5: fromVersion5,
  6: fromVersion6,
};
// A set, and not a look in STEPS, so a version stored as text, such as "2", stays unreadable.
const READABLE = new Set([...Object.keys(STEPS).map(Number), VERSION]);
// Version 2 still had a summary box, which its step takes away. From version 3 on, every box must be of a known type.
const ALL_KNOWN_FROM = 3;

// Each step takes what the one before it left.
function upgraded(graph: Version2, from: number, to = VERSION): Version2 {
  let result = graph;
  for (let version = from; version < to; version++) result = STEPS[version](result);
  return result;
}

const isKnown = (box: PlacedBox) => BOX_TYPES.includes(box.type) && typeof box.data === 'object' && box.data !== null;

// Throws on anything it cannot read, so the caller can keep a copy instead of overwriting it.
export function parseGraph(text: string, names: DefaultNames): Graph {
  const stored = JSON.parse(text) as Stored & Version1;
  if (stored.version === undefined) {
    const { boxes, wires } = fromVersion1(stored);
    // Version 1 leaves out what it cannot read, and it never had a summary box.
    return normalize(upgraded({ boxes: boxes.filter(isKnown), wires }, ALL_KNOWN_FROM), names);
  }
  // Boxes from a newer version, or of a kind this version has never heard of, must not be dropped and written over.
  if (!READABLE.has(stored.version)) throw new Error('Unknown version');
  if (!Array.isArray(stored.boxes) || !Array.isArray(stored.wires)) throw new Error('Unreadable boxes');
  // The check comes before the later steps, which would fill in the data of a broken box and let it through.
  const from = Math.max(stored.version, ALL_KNOWN_FROM);
  const known = upgraded({ boxes: stored.boxes, wires: stored.wires }, stored.version, from);
  if (!known.boxes.every(isKnown)) throw new Error('Unknown box type');
  return normalize(upgraded(known, from), names);
}

export function hasStoredBoxes(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export interface Loaded {
  graph: Graph;
  // What was stored could not be read. It is kept under its own key and the default was used instead.
  recovered: boolean;
}

export function loadGraph(names: DefaultNames): Loaded {
  let text: string | null = null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked. The boxes then last until the page is reloaded.
  }
  if (text === null) return { graph: defaultGraph(names), recovered: false };
  try {
    return { graph: parseGraph(text, names), recovered: false };
  } catch {
    try {
      localStorage.setItem(BACKUP_KEY, text);
    } catch {
      // Nothing more can be done if storage is full.
    }
    return { graph: defaultGraph(names), recovered: true };
  }
}

export function serializeGraph({ boxes, wires }: Graph): string {
  return JSON.stringify({
    version: VERSION,
    boxes: boxes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    wires: wires.map(({ id, source, target, kind }) => ({ id, source, target, kind })),
  });
}

export function saveGraph(graph: Graph) {
  try {
    localStorage.setItem(STORAGE_KEY, serializeGraph(graph));
  } catch {
    // Storage can be blocked. The boxes then last until the page is reloaded.
  }
}
