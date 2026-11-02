import { BaseEdge, EdgeLabelRenderer, getBezierPath, MarkerType, useReactFlow, type Edge, type EdgeProps } from '@xyflow/react';
import { useTranslations } from '../i18n';
import type { Wire, WireKind } from '../model/types';

const MARKER_COLOR: Record<WireKind, string> = {
  money: 'var(--ink)',
  influence: 'var(--curve)',
  basis: 'var(--muted)',
};

// The handle ids are the kinds of wire, so the shape of a dot and the kind of a wire are the same thing.
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

function WireEdge({ id, selected, markerEnd, ...geometry }: EdgeProps) {
  const t = useTranslations();
  const { deleteElements } = useReactFlow();
  const [path, labelX, labelY] = getBezierPath(geometry);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="edge-delete nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            aria-label={t.deleteConnector}
            onClick={() => deleteElements({ edges: [{ id }] })}
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { wire: WireEdge };
