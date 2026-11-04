import { catalog } from './catalog';
import type { BoxType, DefaultNames, Graph, PlacedBox, SimulationInput, Wire, WireKind, XYPosition } from './types';

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

export const wireOf = (source: string, target: string, kind: WireKind): Wire => ({
  id: `${source}-${target}-${kind}`,
  source,
  target,
  kind,
});

const readsG = (box: PlacedBox) => box.type === 'otp' || box.type === 'folketrygd';

// The G box is there exactly as long as a box reads from it.
export function syncG(boxes: PlacedBox[], names: DefaultNames, position: XYPosition = { x: 0, y: -240 }): PlacedBox[] {
  const needed = boxes.some(readsG);
  const present = boxes.some((box) => box.type === 'g');
  if (needed && !present) return [...boxes, createBox('g', freeSpot(position, boxes), names)];
  if (!needed && present) return boxes.filter((box) => box.type !== 'g');
  return boxes;
}

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
