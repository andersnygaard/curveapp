// Boxes in local storage. The only file in the model that touches the browser.
import { BOX_TYPES, catalog } from './catalog';
import { canConnect } from './connections';
import { createBox, defaultGraph, syncG } from './graph';
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

function normalize(boxes: PlacedBox[], wires: Wire[], names: DefaultNames): Graph {
  const known = boxes.map((box) => withDefaults(box, names));
  const withMe = known.some((box) => box.type === 'me') ? known : placeMeBox(known, names);
  return { boxes: syncG(withMe, names), wires: wires.filter((wire) => canConnect(withMe, wire)) };
}

// The box for yourself is always on the canvas, so boxes saved before it existed get one.
function placeMeBox(boxes: PlacedBox[], names: DefaultNames): PlacedBox[] {
  const rightmost = Math.max(0, ...boxes.map((box) => box.position.x));
  const top = Math.min(0, ...boxes.map((box) => box.position.y));
  return [...boxes, createBox('me', { x: rightmost, y: top - 240 }, names)];
}

// A file can skip many versions. Each step takes what the one before it left.
function fromVersion(version: number, graph: Version2): Version2 {
  const atFour = version < 4 ? fromVersion3(graph) : graph;
  const atFive = version < 5 ? fromVersion4(atFour) : atFour;
  const atSix = version < 6 ? fromVersion5(atFive) : atFive;
  return version < 7 ? fromVersion6(atSix) : atSix;
}

const isKnown = (box: PlacedBox) => BOX_TYPES.includes(box.type) && typeof box.data === 'object' && box.data !== null;

// Throws on anything it cannot read, so the caller can keep a copy instead of overwriting it.
export function parseGraph(text: string, names: DefaultNames): Graph {
  const stored = JSON.parse(text) as Stored & Version1;
  if (stored.version === undefined) {
    const { boxes, wires } = fromVersion1(stored);
    const updated = fromVersion(1, { boxes: boxes.filter(isKnown), wires });
    return normalize(updated.boxes, updated.wires, names);
  }
  // Boxes from a newer version, or of a kind this version has never heard of, must not be dropped and written over.
  if (![2, 3, 4, 5, 6, VERSION].includes(stored.version)) throw new Error('Unknown version');
  if (!Array.isArray(stored.boxes) || !Array.isArray(stored.wires)) throw new Error('Unreadable boxes');
  const current = { boxes: stored.boxes, wires: stored.wires };
  const { boxes, wires } = stored.version === 2 ? fromVersion2(current) : current;
  if (!boxes.every(isKnown)) throw new Error('Unknown box type');
  const updated = fromVersion(stored.version, { boxes, wires });
  return normalize(updated.boxes, updated.wires, names);
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
