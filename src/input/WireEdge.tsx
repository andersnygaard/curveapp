import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react';
import { useTranslations } from '../i18n';

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
            className="icon-button icon-button-small icon-button-round edge-delete nodrag nopan"
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

// The edge type that toFlowEdge in flow.ts asks for.
export const edgeTypes = { wire: WireEdge };
