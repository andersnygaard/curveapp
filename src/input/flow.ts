// Where React Flow meets the model. React Flow speaks of nodes, edges, handles and connections, and the model of
// boxes, wires and wire kinds. A handle id is a wire kind, so the shape of a dot and the kind of a wire are one thing.
//
// The boxes and wires in the graph also carry React Flow's own state, such as measured and selected. It has to come
// back on every render, or the cards stay hidden and a wire cannot be deleted, so it rides along in the graph, and the
// casts here let it. Storage and the simulation leave it out (serializeGraph, inputOf).
import {
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnConnectStartParams,
} from '@xyflow/react';
import { catalog } from '../model/catalog';
import type { WireRequest } from '../model/connections';
import type { Box, PlacedBox, Wire, WireKind } from '../model/types';

const MARKER_COLOR: Record<WireKind, string> = {
  money: 'var(--ink)',
  influence: 'var(--curve)',
  basis: 'var(--muted)',
};

export function toFlowEdge(wire: Wire): Edge {
  return {
    ...wire,
    type: 'wire',
    sourceHandle: wire.kind,
    targetHandle: wire.kind,
    className: `wire wire-${wire.kind}`,
    markerEnd: { type: MarkerType.ArrowClosed, color: MARKER_COLOR[wire.kind], width: 16, height: 16 },
  };
}

// A connection being drawn, or one React Flow asks about.
type ConnectionLike = Pick<Connection, 'source' | 'target'> & { targetHandle?: string | null };

// The dot a wire lands on says what kind it is, so a wire from either dot on a salary can reach the square on a pension.
export const wireRequestOf = ({ source, target, targetHandle }: ConnectionLike): WireRequest => ({
  source,
  target,
  kind: targetHandle as WireKind,
});

export const withBoxChanges = (boxes: PlacedBox[], changes: NodeChange[]) => applyNodeChanges(changes, boxes) as PlacedBox[];

export const withWireChanges = (wires: Wire[], changes: EdgeChange[]) =>
  applyEdgeChanges(changes, wires.map(toFlowEdge)) as unknown as Wire[];

// The kinds a wire being drawn can be, so the dots it cannot go to can step back. From the box that gives, that is
// every kind it gives, and from a dot that takes, the kind of that dot.
export function kindsFrom(boxes: Box[], { nodeId, handleId, handleType }: OnConnectStartParams): string | null {
  const box = boxes.find((candidate) => candidate.id === nodeId);
  return handleType === 'source' && box ? Object.keys(catalog[box.type].gives ?? {}).join(' ') : handleId;
}
