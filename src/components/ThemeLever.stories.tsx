import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import ThemeLever from './ThemeLever';

const meta: Meta<typeof ThemeLever> = {
  title: 'Components/ThemeLever',
  component: ThemeLever,
  args: { theme: 'dark', onChange: fn() },
  decorators: [
    (Story) => (
      <div style={{ padding: '1rem' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ThemeLever>;

export const Dark: Story = {
  play: async ({ canvasElement, args }) => {
    const lever = within(canvasElement).getByRole('switch', { name: 'Light colours' });
    await expect(lever).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(lever);
    await expect(args.onChange).toHaveBeenCalledWith('light');
  },
};

export const Light: Story = {
  args: { theme: 'light' },
  play: async ({ canvasElement, args }) => {
    const lever = within(canvasElement).getByRole('switch', { name: 'Light colours' });
    await expect(lever).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(lever);
    await expect(args.onChange).toHaveBeenCalledWith('dark');
  },
};

// The knob stands at the word that is on, so the lever can be read without its colours.
export const TheKnobMoves: Story = {
  args: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const knob = canvasElement.querySelector('.lever-knob')!.getBoundingClientRect();
    const track = canvasElement.querySelector('.lever-track')!.getBoundingClientRect();
    await expect(knob.left + knob.width / 2).toBeGreaterThan(track.left + track.width / 2);
  },
};

export const InNorwegian: Story = {
  globals: { language: 'no' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('switch', { name: 'Lyse farger' })).toBeVisible();
    await expect(canvas.getByText('Mørk')).toBeVisible();
    await expect(canvas.getByText('Lys')).toBeVisible();
  },
};
