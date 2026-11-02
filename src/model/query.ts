import { assumedG, gDefaults } from './boxes/g';
import { validBirthYear } from './boxes/me';
import type { Assumptions, GraphQuery } from './spec';
import type { Box, SimulationInput, WireKind } from './types';

export function assumptionsOf(boxes: Box[]): Assumptions {
  const me = boxes.find((box) => box.type === 'me');
  const g = boxes.find((box) => box.type === 'g');
  return {
    birthYear: me ? validBirthYear(me.data.birthYear) : null,
    retirementAge: me?.data.retirementAge ?? null,
    g: assumedG(g?.data ?? gDefaults()),
  };
}

export function queryOf({ boxes, wires }: SimulationInput): GraphQuery {
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const into = (box: Box, kind: WireKind) =>
    wires.filter((wire) => wire.target === box.id && wire.kind === kind).flatMap((wire) => byId.get(wire.source) ?? []);
  const outOf = (box: Box, kind: WireKind) =>
    wires.filter((wire) => wire.source === box.id && wire.kind === kind).flatMap((wire) => byId.get(wire.target) ?? []);
  return { assumptions: assumptionsOf(boxes), into, outOf };
}
