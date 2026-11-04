// How boxes saved by earlier versions of the app are brought up to date. Stored data must keep working, and a
// stored pension figure must never change meaning without the user knowing. Unknown fields are left out by
// the next step, which fills in defaults.
import { overlaps, wireOf } from './graph';
import type { PlacedBox, Wire, WireKind, XYPosition } from './types';

const PAYMENTS_PER_YEAR: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };
const RETURN_BOX_SPACE = 320;

type Stored = { id: string; type: string; position?: XYPosition; data?: Record<string, unknown> };
export type Version1 = { nodes: Stored[]; edges: { source: string; target: string }[] };
export type Version2 = { boxes: PlacedBox[]; wires: Wire[] };

function freeSpotAbove(position: XYPosition, taken: XYPosition[]): XYPosition {
  let spot = { x: position.x, y: position.y - RETURN_BOX_SPACE };
  while (taken.some((other) => overlaps(spot, other))) spot = { x: spot.x, y: spot.y - RETURN_BOX_SPACE };
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
        data: { name: data.name, annualReturn, returnInterval, standardDeviation },
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
    // Missing fields are left out, so that the next step fills them in.
    const data = JSON.parse(JSON.stringify({ g, gGrowth, standardDeviation }));
    boxes.push({ id: 'g', type: 'g', position: { x: 0, y: -240 }, data });
  }

  const typeOf = (id: string) => (boxes as PlacedBox[]).find((box) => box.id === id)?.type;
  for (const { source, target } of edges) {
    const kind = wireKind(typeOf(source), typeOf(target));
    if (kind) wires.push(wireOf(source, target, kind));
  }
  return { boxes: boxes as PlacedBox[], wires };
}

// Until version 4 the Norwegian default name was Folketrygden, which is the whole scheme and not the pension the box works
// out. Only that exact name on that kind of box changes, since anything else is a name someone has written. It moves no
// money, so no result changes. The words are written out, since this must stay as it is when the texts in the app change.
export function fromVersion3({ boxes, wires }: Version2): Version2 {
  return {
    boxes: boxes.map((box) =>
      box.type === 'folketrygd' && box.data.name === 'Folketrygden' ? { ...box, data: { ...box.data, name: 'Alderspensjon' } } : box,
    ),
    wires,
  };
}

// Until version 5 a withdrawal had its own flat tax on pension. Tax on pension now follows the rules and is per person, so
// the field means nothing any more. What a pension leaves changes with this, which is why it was a decision and not a detail.
export function fromVersion4({ boxes, wires }: Version2): Version2 {
  return {
    boxes: boxes.map((box) => {
      if (box.type !== 'withdrawal') return box;
      const { pensionTax: _gone, ...data } = box.data as typeof box.data & { pensionTax?: number };
      return { ...box, data };
    }),
    wires,
  };
}

// Until version 6 there was one age for when work stopped, in the box for yourself, and each income said whether it followed
// that age. Each income now has its own ages, and the result stays the same: one that followed the age stops at it, and
// the others run on. A missing or empty choice used to count as following the age, so it still does.
export function fromVersion5({ boxes, wires }: Version2): Version2 {
  const me = boxes.find((box) => box.type === 'me');
  const { retirementAge = null } = (me?.data ?? {}) as { retirementAge?: number | null };
  return {
    boxes: boxes.map((box) => {
      if (box.type === 'me') {
        const { retirementAge: _gone, ...data } = box.data as typeof box.data & { retirementAge?: number | null };
        return { ...box, data };
      }
      if (box.type === 'income') {
        const { stopsAtRetirement, ...data } = box.data as typeof box.data & { stopsAtRetirement?: boolean | null };
        return { ...box, data: { ...data, fromAge: null, toAge: (stopsAtRetirement ?? true) ? retirementAge : null } };
      }
      return box;
    }),
    wires,
  };
}

// Until version 7 a home had no kind, since nothing read it. The wealth tax counts them differently, and a file cannot say
// which box is the cabin, so all of them become the home you live in. It moves no money, and two of them get a warning.
export function fromVersion6({ boxes, wires }: Version2): Version2 {
  return {
    boxes: boxes.map((box) => (box.type === 'housing' ? { ...box, data: { ...box.data, kind: 'primary' } } : box)),
    wires,
  };
}

// Version 2 had a summary box, which read what was wired to it. A withdrawal now shows what it draws on by itself, so
// the box and its wires go. It moved no money, so no result changes and nothing else in the file is touched.
export function fromVersion2({ boxes, wires }: Version2): Version2 {
  const gone = new Set(boxes.filter((box) => (box.type as string) === 'summary').map((box) => box.id));
  return {
    boxes: boxes.filter((box) => !gone.has(box.id)),
    wires: wires.filter((wire) => !gone.has(wire.source) && !gone.has(wire.target)),
  };
}
