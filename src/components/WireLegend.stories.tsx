import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import WireLegend from './WireLegend';

const meta: Meta<typeof WireLegend> = { title: 'Components/WireLegend', component: WireLegend };
export default meta;

type Story = StoryObj<typeof WireLegend>;

export const ThreeKinds: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Money', 'Influence', 'Basis']);
    for (const kind of ['money', 'influence', 'basis']) {
      await expect(canvasElement.querySelector(`.port-sample.port-${kind}`)).not.toBeNull();
    }
  },
};
