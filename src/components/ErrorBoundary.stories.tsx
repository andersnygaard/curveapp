import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import ErrorBoundary from './ErrorBoundary';

function Broken(): never {
  throw new Error('A failure made for this story');
}

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
  args: { message: 'Something went wrong on this page.' },
};
export default meta;

type Story = StoryObj<typeof ErrorBoundary>;

export const NothingWrong: Story = {
  args: { children: <p>The page</p> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('The page')).toBeVisible();
    await expect(canvas.queryByText('Something went wrong on this page.')).toBeNull();
  },
};

export const ChildFails: Story = {
  args: { children: <Broken /> },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Something went wrong on this page.')).toBeVisible();
  },
};
