import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { translations } from '../i18n';
import { createBox, defaultGraph, syncG } from '../model/graph';
import type { Graph } from '../model/types';
import InputTab from './InputTab';
import { useSimulationInput } from './useGraph';

const names = translations.en.defaultNames;

function withPension(): Graph {
  const graph = defaultGraph(names);
  const otp = createBox('otp', { x: 410, y: -300 }, names);
  return { ...graph, boxes: syncG([...graph.boxes, otp], names) };
}

function Tab({ recovered = false, planOpen = false }: { recovered?: boolean; planOpen?: boolean }) {
  const [graph, setGraph] = useState(withPension);
  const input = useSimulationInput(graph);
  return <InputTab graph={graph} setGraph={setGraph} input={input} recovered={recovered} planOpen={planOpen} />;
}

const meta: Meta<typeof Tab> = {
  title: 'Input/InputTab',
  component: Tab,
  decorators: [
    (Story) => (
      <div className="panel">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Tab>;

const center = (element: Element) => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { clientX: left + width / 2, clientY: top + height / 2 };
};

async function drawWire(canvasElement: HTMLElement, from: string, to: string) {
  canvasElement.querySelector('.input-canvas')!.scrollIntoView({ block: 'center' });
  const source = canvasElement.querySelector(from)!;
  const target = canvasElement.querySelector(to)!;
  await fireEvent.mouseDown(source, { ...center(source), button: 0 });
  await fireEvent.mouseMove(document, center(target));
  await fireEvent.mouseUp(document, center(target));
}

const wires = (canvasElement: HTMLElement, kind: string) =>
  canvasElement.querySelectorAll(`.react-flow__edge.wire-${kind}`).length;

const ready = (canvasElement: HTMLElement) =>
  waitFor(() => expect(canvasElement.querySelector('.box-otp .port-basis')?.getBoundingClientRect().width).toBeGreaterThan(0));

export const AddingABox: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await ready(canvasElement);
    const before = canvasElement.querySelectorAll('.box-account').length;
    await userEvent.click(canvas.getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(canvasElement.querySelectorAll('.box-account')).toHaveLength(before + 1));
  },
};

export const DeletingABox: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await ready(canvasElement);
    await fireEvent.click(canvas.getByRole('button', { name: `Delete ${names.otp}` }));
    await waitFor(() => expect(canvasElement.querySelector('.box-otp')).toBeNull());
    // Nothing reads G any more, so it goes as well.
    await expect(canvasElement.querySelector('.box-g')).toBeNull();
  },
};

export const WiringSalaryFromTheSquare: Story = {
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    await drawWire(canvasElement, '.box-income .port-basis', '.box-otp .port-basis');
    await waitFor(() => expect(wires(canvasElement, 'basis')).toBe(1));
  },
};

// The round dot is where every other wire starts, so a wire from there has to reach the square as well.
export const WiringSalaryFromTheRoundDot: Story = {
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    const money = wires(canvasElement, 'money');
    await drawWire(canvasElement, '.box-income .port-money', '.box-otp .port-basis');
    await waitFor(() => expect(wires(canvasElement, 'basis')).toBe(1));
    // Salary only gives the pension its basis. It moves no money there.
    await expect(wires(canvasElement, 'money')).toBe(money);
  },
};

export const RefusedWires: Story = {
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    const before = canvasElement.querySelectorAll('.react-flow__edge').length;
    await drawWire(canvasElement, '.box-income .port-money', '.box-otp .port-influence');
    await drawWire(canvasElement, '.box-return .port-influence', '.box-otp .port-basis');
    await drawWire(canvasElement, '.box-account .port-money.source', '.box-otp .port-basis');
    await expect(canvasElement.querySelectorAll('.react-flow__edge')).toHaveLength(before);
  },
};

export const WhileDrawing: Story = {
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    const source = canvasElement.querySelector('.box-income .port-money')!;
    const { clientX, clientY } = center(source);
    await fireEvent.mouseDown(source, { clientX, clientY, button: 0 });
    // A wire starts when the mouse moves, not when the button goes down.
    await fireEvent.mouseMove(document, { clientX: clientX + 20, clientY: clientY + 20 });
    const opacity = (selector: string) => getComputedStyle(canvasElement.querySelector(selector)!).opacity;
    // A salary can reach both round dots and squares, so those stay lit while the rest step back.
    await waitFor(() => expect(opacity('.box-account .port-influence')).toBe('0.2'));
    await expect(opacity('.box-otp .port-basis')).toBe('1');
    await expect(opacity('.box-transfer .port-money')).toBe('1');
    await fireEvent.mouseUp(document, center(source));
  },
};

export const RecoveredFromUnreadableStorage: Story = {
  args: { recovered: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(translations.en.storageRecovered)).toBeVisible();
  },
};
