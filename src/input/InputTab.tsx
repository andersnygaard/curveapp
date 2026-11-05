import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import WireLegend from '../components/WireLegend';
import { prefersReducedMotion } from '../components/canvas';
import { amountFormat } from '../components/formats';
import { useTranslations } from '../i18n';
import { ADDABLE_TYPES, catalog, type AddableType } from '../model/catalog';
import { diagnose } from '../model/compile';
import { canConnect, connect } from '../model/connections';
import { createBox, freeSpot, syncG } from '../model/graph';
import { queryOf } from '../model/query';
import type { Graph, SimulationInput } from '../model/types';
import { CardContext, nodeTypes } from './BoxCards';
import { kindsFrom, toFlowEdge, wireRequestOf, withBoxChanges, withWireChanges } from './flow';
import { edgeTypes } from './WireEdge';

const BOX_WIDTH = 296;
const FIT_VIEW = { maxZoom: 1, padding: 0.12 };
const FIT_VIEW_DELAY_MS = 60;
// How long the boxes take to glide into view. Without motion they are there at once.
const FIT_VIEW_MS = 250;
// Long enough for the plan to have made room, as set in styles.css, so the boxes are fitted to the final width.
const FIT_AFTER_PLAN_MS = 260;

interface Props {
  graph: Graph;
  setGraph: Dispatch<SetStateAction<Graph>>;
  input: SimulationInput;
  recovered: boolean;
  planShown: boolean;
}

function Canvas({ graph, setGraph, input, recovered, planShown }: Props) {
  const t = useTranslations();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const canvas = useRef<HTMLDivElement>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const edges = useMemo(() => graph.wires.map(toFlowEdge), [graph.wires]);
  const cards = useMemo(
    () => ({ query: queryOf(input), diagnostics: diagnose(input), amount: (value: number) => amountFormat(t.locale).format(value) }),
    [input, t.locale],
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
    return setTimeout(() => fitView({ ...FIT_VIEW, duration: prefersReducedMotion() ? 0 : FIT_VIEW_MS }), delay);
  }

  // The canvas gets wider or narrower with the plan, and the boxes should still all be in view.
  const planWas = useRef(planShown);
  useEffect(() => {
    if (planWas.current === planShown) return;
    planWas.current = planShown;
    const timer = fitSoon(FIT_AFTER_PLAN_MS);
    return () => clearTimeout(timer);
  }, [planShown]);

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
            // Later, settled(graph) and connected(graph, request) in model/graph.ts take the place of syncG and connect here.
            onNodesChange={(changes) =>
              setGraph((current) => ({ ...current, boxes: syncG(withBoxChanges(current.boxes, changes), t.defaultNames) }))
            }
            onEdgesChange={(changes) => setGraph((current) => ({ ...current, wires: withWireChanges(current.wires, changes) }))}
            onConnect={(connection) =>
              setGraph((current) => ({ ...current, wires: connect(current.boxes, current.wires, wireRequestOf(connection)) }))
            }
            onConnectStart={(_, start) => setConnecting(kindsFrom(graph.boxes, start))}
            onConnectEnd={() => setConnecting(null)}
            isValidConnection={(connection) => canConnect(graph.boxes, wireRequestOf(connection))}
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
