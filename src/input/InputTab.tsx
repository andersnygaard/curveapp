import { useRef, type Dispatch, type SetStateAction } from 'react';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LanguageContext, translations, type Language } from '../i18n';
import { edgeTypes, nodeTypes } from './BoxCards';
import { canConnect, connect, newBox, syncGBox, type Box, type BoxGraph } from './boxes';

const ADDABLE = ['income', 'transfer', 'account', 'otp', 'pension'] as const;
const BOX_WIDTH = 296;
const defaultEdgeOptions = {
  type: 'box',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#566878', width: 18, height: 18 },
};

interface Props {
  language: Language;
  graph: BoxGraph;
  setGraph: Dispatch<SetStateAction<BoxGraph>>;
}

function Canvas({ language, graph, setGraph }: Props) {
  const t = translations[language];
  const { screenToFlowPosition } = useReactFlow();
  const canvas = useRef<HTMLDivElement>(null);

  function add(type: (typeof ADDABLE)[number]) {
    const { left, top, width, height } = canvas.current!.getBoundingClientRect();
    const stagger = (graph.nodes.length % 6) * 24;
    const position = screenToFlowPosition({
      x: left + width / 2 - BOX_WIDTH / 2 + stagger,
      y: top + height / 4 + stagger,
    });
    const corner = screenToFlowPosition({ x: left + 24, y: top + 24 });
    setGraph((current) => ({ ...current, nodes: syncGBox([...current.nodes, newBox(type, position)], corner) }));
  }

  return (
    <div className="input">
      <div className="input-toolbar">
        {ADDABLE.map((type) => (
          <button key={type} type="button" className="input-add" onClick={() => add(type)}>
            {t.addBox(type)}
          </button>
        ))}
      </div>
      <p className="input-help">{t.inputHelp}</p>
      <div ref={canvas} className="input-canvas">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodesChange={(changes) =>
            setGraph((current) => ({ ...current, nodes: syncGBox(applyNodeChanges(changes, current.nodes) as Box[]) }))
          }
          onEdgesChange={(changes) =>
            setGraph((current) => ({ ...current, edges: applyEdgeChanges(changes, current.edges) }))
          }
          onConnect={(connection) => setGraph((current) => ({ ...current, edges: connect(current, connection) }))}
          isValidConnection={(connection) => canConnect(graph.nodes, connection)}
          deleteKeyCode={['Backspace', 'Delete']}
          minZoom={0.3}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.12 }}
        >
          <Background gap={24} color="#c3d2db" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function InputTab(props: Props) {
  return (
    <LanguageContext.Provider value={props.language}>
      <ReactFlowProvider>
        <Canvas {...props} />
      </ReactFlowProvider>
    </LanguageContext.Provider>
  );
}
