import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
import WireLegend from '../components/WireLegend';
import { useTranslations } from '../i18n';
import { ADDABLE_TYPES, catalog, type AddableType } from '../model/catalog';
import { diagnose } from '../model/compile';
import { canConnect, connect } from '../model/connections';
import { createBox, freeSpot, syncG } from '../model/graph';
import { queryOf } from '../model/query';
import type { Graph, PlacedBox, SimulationInput, Wire, WireKind } from '../model/types';
import { CardContext, nodeTypes } from './BoxCards';
import { edgeTypes, toFlowEdge } from './WireEdge';

const BOX_WIDTH = 296;
const FIT_VIEW = { maxZoom: 1, padding: 0.12 };
const FIT_VIEW_DELAY_MS = 60;
// Long enough for the plan to have made room, as set in styles.css, so the boxes are fitted to the final width.
const FIT_AFTER_PLAN_MS = 260;

interface Props {
  graph: Graph;
  setGraph: Dispatch<SetStateAction<Graph>>;
  input: SimulationInput;
  recovered: boolean;
  planOpen: boolean;
}

function Canvas({ graph, setGraph, input, recovered, planOpen }: Props) {
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
    fitSoon();
  }

  function fitSoon(delay = FIT_VIEW_DELAY_MS) {
    return setTimeout(() => fitView({ ...FIT_VIEW, duration: 250 }), delay);
  }

  // The canvas gets wider or narrower with the plan, and the boxes should still all be in view.
  const planWas = useRef(planOpen);
  useEffect(() => {
    if (planWas.current === planOpen) return;
    planWas.current = planOpen;
    const timer = fitSoon(FIT_AFTER_PLAN_MS);
    return () => clearTimeout(timer);
  }, [planOpen]);

  // The dot a wire lands on says what kind it is, so a wire from either dot on a salary can reach the square on a pension.
  function wireOf({ source, target, targetHandle }: Connection | { source: string; target: string; targetHandle?: string | null }) {
    return { source, target, kind: targetHandle as WireKind };
  }

  function kindsFrom(nodeId: string | null, handleId: string | null, handleType: string | null) {
    const box = graph.boxes.find((candidate) => candidate.id === nodeId);
    return handleType === 'source' && box ? Object.keys(catalog[box.type].gives ?? {}).join(' ') : handleId;
  }

  return (
    <div className="input">
      {recovered && <p className="input-recovered">{t.storageRecovered}</p>}
      <div className="input-toolbar">
        {ADDABLE_TYPES.filter((type) => !catalog[type].onlyOne || !graph.boxes.some((box) => box.type === type)).map((type) => (
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
            onConnect={(connection) =>
              setGraph((current) => ({ ...current, wires: connect(current.boxes, current.wires, wireOf(connection)) }))
            }
            onConnectStart={(_, { nodeId, handleId, handleType }) => setConnecting(kindsFrom(nodeId, handleId, handleType))}
            onConnectEnd={() => setConnecting(null)}
            isValidConnection={(connection) => canConnect(graph.boxes, wireOf(connection))}
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
