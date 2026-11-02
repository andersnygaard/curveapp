import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import LanguagePicker from './LanguagePicker';

const meta: Meta<typeof LanguagePicker> = {
  title: 'Components/LanguagePicker',
  component: LanguagePicker,
  args: { language: 'en', onChange: fn() },
};
export default meta;

type Story = StoryObj<typeof LanguagePicker>;

export const English: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'Norsk' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(canvas.getByRole('button', { name: 'Norsk' }));
    await expect(args.onChange).toHaveBeenCalledWith('no');
  },
};

export const Norwegian: Story = {
  args: { language: 'no' },
  globals: { language: 'no' },
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole('group', { name: 'Språk' });
    await expect(within(group).getByRole('button', { name: 'Norsk' })).toHaveAttribute('aria-pressed', 'true');
  },
};
