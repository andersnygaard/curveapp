import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import Footer from './Footer';

const meta: Meta<typeof Footer> = { title: 'Components/Footer', component: Footer };
export default meta;

type Story = StoryObj<typeof Footer>;

export const English: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Privacy statement')).toBeVisible();
  },
};

export const Norwegian: Story = {
  globals: { language: 'no' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Personvernerklæring')).toBeVisible();
  },
};
