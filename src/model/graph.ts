import { catalog } from './catalog';
import { canConnect, connect, wireOf, type WireRequest } from './connections';
import type { BoxType, DefaultNames, Graph, PlacedBox, SimulationInput, XYPosition } from './types';

// Made in connections.ts, which wires by it, and offered here as well, where the drawing is put together.
export { wireOf };

// Roomy enough for most cards. Cards are only measured once they are on screen.
const ESTIMATED_BOX = { width: 320, height: 300 };

export function overlaps(a: XYPosition, b: XYPosition): boolean {
  return Math.abs(a.x - b.x) < ESTIMATED_BOX.width && Math.abs(a.y - b.y) < ESTIMATED_BOX.height;
}

// The nearest place around the wanted one where a new box covers nothing, searching outwards ring by ring.
export function freeSpot(wanted: XYPosition, boxes: { position: XYPosition }[]): XYPosition {
  for (let ring = 0; ; ring++) {
    for (let row = -ring; row <= ring; row++) {
      for (let column = -ring; column <= ring; column++) {
        if (Math.max(Math.abs(row), Math.abs(column)) !== ring) continue;
        const spot = { x: wanted.x + column * ESTIMATED_BOX.width, y: wanted.y + row * ESTIMATED_BOX.height };
        if (!boxes.some((box) => overlaps(spot, box.position))) return spot;
      }
    }
  }
}

export function createBox<Type extends BoxType>(type: Type, position: XYPosition, names: DefaultNames): PlacedBox {
  const id = `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const box = { id, type, position, data: catalog[type].defaults(names) } as PlacedBox;
  return catalog[type].fixed ? { ...box, deletable: false } : box;
}

const readsG = (box: PlacedBox) => catalog[box.type].readsG === true;

// The G box is there exactly as long as a box reads from it.
export function syncG(boxes: PlacedBox[], names: DefaultNames, position: XYPosition = { x: 0, y: -240 }): PlacedBox[] {
  const needed = boxes.some(readsG);
  const present = boxes.some((box) => box.type === 'g');
  if (needed && !present) return [...boxes, createBox('g', freeSpot(position, boxes), names)];
  if (!needed && present) return boxes.filter((box) => box.type !== 'g');
  return boxes;
}

// The box for yourself is always on the canvas, so boxes saved before it existed get one.
function placeMeBox(boxes: PlacedBox[], names: DefaultNames): PlacedBox[] {
  const rightmost = Math.max(0, ...boxes.map((box) => box.position.x));
  const top = Math.min(0, ...boxes.map((box) => box.position.y));
  return [...boxes, createBox('me', { x: rightmost, y: top - 240 }, names)];
}

// What every drawing keeps, however it came to be: the box for yourself is there, G is there exactly while a box reads
// it, and a wire only joins boxes that can be joined. Loading a file ends here, and so can every change on the canvas.
// How many boxes of a kind there are and how many wires a box takes are left as they are, since compiling reads the first.
export function settled(graph: Graph, names: DefaultNames, gSpot?: XYPosition): Graph {
  const withMe = graph.boxes.some((box) => box.type === 'me') ? graph.boxes : placeMeBox(graph.boxes, names);
  const boxes = syncG(withMe, names, gSpot);
  const wires = graph.wires.filter((wire) => canConnect(boxes, wire));
  // The same graph if nothing changed, so a simulation that has nothing new to show keeps running.
  return boxes === graph.boxes && wires.length === graph.wires.length ? graph : { boxes, wires };
}

// The drawing with one more wire. Where a box takes only one wire of that kind, the new one replaces the old.
export const connected = (graph: Graph, request: WireRequest): Graph => ({
  ...graph,
  wires: connect(graph.boxes, graph.wires, request),
});

export function defaultGraph(names: DefaultNames): Graph {
  const income = createBox('income', { x: 0, y: 70 }, names);
  const transfer = createBox('transfer', { x: 410, y: 90 }, names);
  const account = createBox('account', { x: 820, y: 40 }, names);
  const market = createBox('return', { x: 820, y: -230 }, names);
  const me = createBox('me', { x: 0, y: -230 }, names);
  const wealthTax = createBox('wealthTax', { x: 410, y: 330 }, names);
  return {
    boxes: [income, transfer, account, market, me, wealthTax],
    wires: [
      wireOf(income.id, transfer.id, 'money'),
      wireOf(transfer.id, account.id, 'money'),
      wireOf(market.id, account.id, 'influence'),
    ],
  };
}

export function inputOf({ boxes, wires }: Graph): SimulationInput {
  return {
    boxes: boxes.map(({ id, type, data }) => ({ id, type, data }) as SimulationInput['boxes'][number]),
    wires: wires.map(({ id, source, target, kind }) => ({ id, source, target, kind })),
  };
}
