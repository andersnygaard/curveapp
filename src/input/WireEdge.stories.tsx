import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, waitFor, within } from 'storybook/test';
import { translations } from '../i18n';
import { defaultGraph } from '../model/graph';
import InputTab from './InputTab';
import { useSimulationInput } from './useSetup';

// A wire is only drawn on the canvas, and whether it is selected rides along in the graph there, so it is tested on one.
function Canvas() {
  const [graph, setGraph] = useState(() => defaultGraph(translations.en.defaultNames));
  const input = useSimulationInput(graph);
  return <InputTab graph={graph} setGraph={setGraph} input={input} recovered={false} planShown={false} />;
}

const meta: Meta<typeof Canvas> = {
  title: 'Input/WireEdge',
  component: Canvas,
  decorators: [
    (Story) => (
      <div className="panel">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Canvas>;

const wires = (canvasElement: HTMLElement) => canvasElement.querySelectorAll('.react-flow__edge');

export const ASelectedWireCanBeDeleted: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(wires(canvasElement)).toHaveLength(3));
    // Only the wire that is selected has a button, so the canvas is not full of them.
    await expect(canvas.queryByRole('button', { name: 'Delete connector' })).toBeNull();

    await fireEvent.click(wires(canvasElement)[0]);
    await fireEvent.click(await canvas.findByRole('button', { name: 'Delete connector' }));
    await waitFor(() => expect(wires(canvasElement)).toHaveLength(2));
    await expect(canvas.queryByRole('button', { name: 'Delete connector' })).toBeNull();
  },
};
