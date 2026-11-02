// How boxes saved by earlier versions of the app are brought up to date. Stored data must keep working, and a
// stored pension figure must never change meaning without the user knowing. Unknown fields are left out by
// the next step, which fills in defaults.
import type { PlacedBox, Wire, WireKind, XYPosition } from './types';
import { wireOf } from './graph';

const PAYMENTS_PER_YEAR: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };
const ESTIMATED_BOX = { width: 296, height: 210 };
const RETURN_BOX_SPACE = 250;

type Stored = { id: string; type: string; position?: XYPosition; data?: Record<string, unknown> };
export type Version1 = { nodes: Stored[]; edges: { source: string; target: string }[] };

function overlaps(a: XYPosition, b: XYPosition): boolean {
  return Math.abs(a.x - b.x) < ESTIMATED_BOX.width && Math.abs(a.y - b.y) < ESTIMATED_BOX.height;
}

function freeSpotAbove(position: XYPosition, taken: XYPosition[]): XYPosition {
  let spot = { x: position.x, y: position.y - RETURN_BOX_SPACE };
  while (taken.some((other) => overlaps(spot, other))) spot = { x: spot.x, y: spot.y - ESTIMATED_BOX.height };
  return spot;
}

function wireKind(source: string | undefined, target: string | undefined): WireKind | null {
  if (source === 'income' && target === 'transfer') return 'money';
  if (source === 'transfer' && target === 'account') return 'money';
  if (source === 'income' && (target === 'otp' || target === 'folketrygd')) return 'basis';
  return null;
}

// Version 1 had return inside the account and the OTP card, called Folketrygden "pension" and used one amount for both
// money and pension basis. An older version still kept G inside the Folketrygden card.
export function fromVersion1({ nodes, edges }: Version1): { boxes: PlacedBox[]; wires: Wire[] } {
  const known = nodes.filter((node) => node.position && node.data);
  const taken = known.map((node) => node.position!);
  const boxes: unknown[] = [];
  const wires: Wire[] = [];

  for (const node of known) {
    const { id, position } = node;
    const data = node.data!;
    if (node.type === 'income') {
      const payments = PAYMENTS_PER_YEAR[String(data.interval)] ?? 12;
      boxes.push({ id, type: 'income', position, data: { ...data, pensionBasis: Number(data.amount) * payments } });
    } else if (node.type === 'account' || node.type === 'otp') {
      const spot = freeSpotAbove(position!, taken);
      taken.push(spot);
      const { annualReturn, returnInterval, standardDeviation, ...rest } = data;
      boxes.push({ id, type: node.type, position, data: rest });
      boxes.push({
        id: `${id}-return`,
        type: 'return',
        position: spot,
        data: { name: `${String(data.name)}: return`, annualReturn, returnInterval, standardDeviation },
      });
      wires.push(wireOf(`${id}-return`, id, 'influence'));
    } else if (node.type === 'pension') {
      const { name, startAmount, startDate } = data;
      boxes.push({ id, type: 'folketrygd', position, data: { name, startAmount, startDate } });
    } else {
      boxes.push({ id, type: node.type, position, data });
    }
  }

  const older = known.find((node) => node.type === 'pension' && node.data && 'g' in node.data);
  if (older && !known.some((node) => node.type === 'g')) {
    const { g, gGrowth, standardDeviation } = older.data!;
    boxes.push({ id: 'g', type: 'g', position: { x: 0, y: -240 }, data: { g, gGrowth, standardDeviation } });
  }

  const typeOf = (id: string) => (boxes as PlacedBox[]).find((box) => box.id === id)?.type;
  for (const { source, target } of edges) {
    const kind = wireKind(typeOf(source), typeOf(target));
    if (kind) wires.push(wireOf(source, target, kind));
  }
  return { boxes: boxes as PlacedBox[], wires };
}
