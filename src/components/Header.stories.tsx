import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import Header from './Header';
import LanguagePicker from './LanguagePicker';

const meta: Meta<typeof Header> = {
  title: 'Components/Header',
  component: Header,
  args: { children: <LanguagePicker language="en" onChange={fn()} /> },
};
export default meta;

type Story = StoryObj<typeof Header>;

export const WithLanguages: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Curve' })).toBeVisible();
    await expect(canvas.getByRole('group', { name: 'Language' })).toBeVisible();
  },
};
