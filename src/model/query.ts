import { assumedG, gDefaults } from './boxes/g';
import { validBirthYear } from './boxes/me';
import type { Assumptions, GraphQuery } from './spec';
import type { Box, BoxOfType, BoxType, SimulationInput, WireKind } from './types';

export function assumptionsOf(boxes: Box[]): Assumptions {
  const me = boxes.find((box) => box.type === 'me');
  const g = boxes.find((box) => box.type === 'g');
  return {
    birthYear: me ? validBirthYear(me.data.birthYear) : null,
    g: assumedG(g?.data ?? gDefaults()),
  };
}

// What draws from an account goes after what fills it, so a chain of accounts works the same however it was drawn.
export function drawRank(box: Box, query: GraphQuery, seen: string[] = []): number {
  if (seen.includes(box.id)) return 0;
  const accounts = query.into(box, 'money').filter((source) => source.type === 'account');
  const feeders = accounts
    .flatMap((account) => query.into(account, 'money'))
    .filter((feeder) => feeder.type === 'transfer' || feeder.type === 'withdrawal');
  return feeders.reduce((rank, feeder) => Math.max(rank, 1 + drawRank(feeder, query, [...seen, box.id])), 0);
}

export function queryOf({ boxes, wires }: SimulationInput): GraphQuery {
  const byId = new Map(boxes.map((box) => [box.id, box]));
  const into = (box: Box, kind: WireKind) =>
    wires.filter((wire) => wire.target === box.id && wire.kind === kind).flatMap((wire) => byId.get(wire.source) ?? []);
  const outOf = (box: Box, kind: WireKind) =>
    wires.filter((wire) => wire.source === box.id && wire.kind === kind).flatMap((wire) => byId.get(wire.target) ?? []);
  const allOf = <Type extends BoxType>(type: Type) => boxes.filter((box): box is BoxOfType<Type> => box.type === type);
  return { assumptions: assumptionsOf(boxes), into, outOf, allOf };
}
