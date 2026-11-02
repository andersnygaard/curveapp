// What can be wired to what. The rules come from the catalog, so there is no list of box types to keep up to date here.
import { catalog } from './catalog';
import type { Box, Wire, WireKind } from './types';

export interface WireRequest {
  source: string;
  target: string;
  kind: WireKind;
}

export function canConnect(boxes: Box[], { source, target, kind }: WireRequest): boolean {
  const from = boxes.find((box) => box.id === source);
  const to = boxes.find((box) => box.id === target);
  if (!from || !to || from === to) return false;
  if (!catalog[from.type].gives?.[kind]) return false;
  return catalog[to.type].takes?.[kind]?.from.includes(from.type) ?? false;
}

// Where a box takes only one wire of a kind, a new wire replaces the old one instead of being refused.
export function connect(boxes: Box[], wires: Wire[], { source, target, kind }: WireRequest): Wire[] {
  const typeOf = (id: string) => boxes.find((box) => box.id === id)!.type;
  const givesOne = catalog[typeOf(source)].gives?.[kind] === 1;
  const takesOne = catalog[typeOf(target)].takes?.[kind]?.max === 1;
  const kept = wires.filter(
    (wire) =>
      wire.kind !== kind ||
      !(
        (wire.source === source && wire.target === target) ||
        (givesOne && wire.source === source) ||
        (takesOne && wire.target === target)
      ),
  );
  return [...kept, { id: `${source}-${target}-${kind}`, source, target, kind }];
}
