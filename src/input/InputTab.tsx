import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslations } from '../i18n';
import { ADDABLE_TYPES, type AddableType } from '../model/catalog';
import { diagnose } from '../model/compile';
import { canConnect, connect } from '../model/connections';
import { createBox, freeSpot, syncG } from '../model/graph';
import { queryOf } from '../model/query';
import type { Graph, PlacedBox, SimulationInput, Wire, WireKind } from '../model/types';
import { CardContext, nodeTypes } from './BoxCards';
import { edgeTypes, toFlowEdge } from './WireEdge';

const BOX_WIDTH = 296;
const FIT_VIEW = { maxZoom: 1, padding: 0.12 };
const FIT_VIEW_AFTER_ADDING_MS = 60;

interface Props {
  graph: Graph;
  setGraph: Dispatch<SetStateAction<Graph>>;
  input: SimulationInput;
  recovered: boolean;
}

function WireLegend() {
  const t = useTranslations();
  const kinds: [WireKind, string][] = [
    ['money', t.wireMoney],
    ['influence', t.wireInfluence],
    ['basis', t.wireBasis],
  ];
  return (
    <ul className="wire-legend">
      {kinds.map(([kind, label]) => (
        <li key={kind}>
          <span className={`port-sample port-${kind}`} aria-hidden="true" />
          <svg viewBox="0 0 32 8" aria-hidden="true">
            <line className={`wire-sample wire-sample-${kind}`} x1="0" x2="32" y1="4" y2="4" />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

function Canvas({ graph, setGraph, input, recovered }: Props) {
  const t = useTranslations();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const canvas = useRef<HTMLDivElement>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const edges = useMemo(() => graph.wires.map(toFlowEdge), [graph.wires]);
  const money = useMemo(() => new Intl.NumberFormat(t.locale, { maximumFractionDigits: 0 }), [t.locale]);
  const cards = useMemo(
    () => ({ query: queryOf(input), diagnostics: diagnose(input), money: (amount: number) => money.format(amount) }),
    [input, money],
  );

  function add(type: AddableType) {
    const { left, top, width, height } = canvas.current!.getBoundingClientRect();
    const wanted = screenToFlowPosition({ x: left + width / 2 - BOX_WIDTH / 2, y: top + height / 4 });
    const corner = screenToFlowPosition({ x: left + 24, y: top + 24 });
    const box = createBox(type, freeSpot(wanted, graph.boxes), t.defaultNames);
    setGraph((current) => ({ ...current, boxes: syncG([...current.boxes, box], t.defaultNames, corner) }));
    // The free spot may be outside the view, and the card is only measured once it is on screen.
    setTimeout(() => fitView({ ...FIT_VIEW, duration: 250 }), FIT_VIEW_AFTER_ADDING_MS);
  }

  function wireOf({ source, target, sourceHandle, targetHandle }: Connection | { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) {
    return sourceHandle === targetHandle ? { source, target, kind: sourceHandle as WireKind } : null;
  }

  return (
    <div className="input">
      {recovered && <p className="input-recovered">{t.storageRecovered}</p>}
      <div className="input-toolbar">
        {ADDABLE_TYPES.map((type) => (
          <button key={type} type="button" className="input-add" onClick={() => add(type)}>
            {t.addBox[type]}
          </button>
        ))}
      </div>
      <div className="input-guide">
        <p className="input-help">{t.inputHelp}</p>
        <WireLegend />
      </div>
      <div ref={canvas} className="input-canvas" data-connecting={connecting ?? undefined}>
        <CardContext.Provider value={cards}>
          <ReactFlow
            nodes={graph.boxes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={(changes) =>
              setGraph((current) => ({
                ...current,
                boxes: syncG(applyNodeChanges(changes, current.boxes) as PlacedBox[], t.defaultNames),
              }))
            }
            onEdgesChange={(changes) =>
              setGraph((current) => ({
                ...current,
                wires: applyEdgeChanges(changes, current.wires.map(toFlowEdge)) as unknown as Wire[],
              }))
            }
            onConnect={(connection) => {
              const wire = wireOf(connection);
              if (wire) setGraph((current) => ({ ...current, wires: connect(current.boxes, current.wires, wire) }));
            }}
            onConnectStart={(_, { handleId }) => setConnecting(handleId)}
            onConnectEnd={() => setConnecting(null)}
            isValidConnection={(connection) => {
              const wire = wireOf(connection);
              return wire !== null && canConnect(graph.boxes, wire);
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            minZoom={0.3}
            fitView
            fitViewOptions={FIT_VIEW}
          >
            <Background gap={24} color="var(--line)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </CardContext.Provider>
      </div>
    </div>
  );
}

export default function InputTab(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
