import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, spyOn, userEvent, waitFor, within } from 'storybook/test';
import App from './App';

// A setup someone saved earlier. The numbers are made up.
const savedSetup = JSON.stringify({
  version: 2,
  boxes: [
    {
      id: 'loaded',
      type: 'account',
      position: { x: 0, y: 0 },
      data: { name: 'From the file', startAmount: 123_000, startDate: '2030-01-01', currency: 'NOK', accountType: 'regular', taxRate: 0, inflation: 0 },
    },
    { id: 'me', type: 'me', position: { x: 400, y: 0 }, data: { birthYear: 0, retirementAge: null } },
  ],
  wires: [],
});

const stored = () => localStorage.getItem('curve.boxes') ?? '';
const fileOf = (text: string) => new File([text], 'setup.json', { type: 'application/json' });

async function choose(canvasElement: HTMLElement, text: string) {
  await userEvent.upload(canvasElement.querySelector<HTMLInputElement>('input[type=file]')!, fileOf(text));
}

const meta: Meta<typeof App> = {
  title: 'App',
  component: App,
  beforeEach: () => {
    localStorage.removeItem('curve.boxes');
    localStorage.removeItem('curve.language');
    const confirm = spyOn(window, 'confirm').mockReturnValue(true);
    return () => {
      confirm.mockRestore();
      localStorage.removeItem('curve.boxes');
      localStorage.removeItem('curve.language');
    };
  },
};
export default meta;

type Story = StoryObj<typeof App>;

export const SavingGivesWhatIsStored: Story = {
  play: async ({ canvasElement }) => {
    const created = spyOn(URL, 'createObjectURL');
    let name = '';
    const click = spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    await waitFor(() => expect(stored()).not.toBe(''));
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Save the setup as a file' }));
    await expect(name).toMatch(/^curve-\d{4}-\d{2}-\d{2}\.json$/);
    const saved = await (created.mock.calls[0][0] as Blob).text();
    await expect(saved).toBe(stored());
    await expect(JSON.parse(saved).version).toBeGreaterThan(1);
    click.mockRestore();
    created.mockRestore();
  },
};

export const LoadingReplacesTheSetup: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Input' }));
    await waitFor(() => expect(canvasElement.querySelectorAll('.box-income')).toHaveLength(1));

    await choose(canvasElement, savedSetup);
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    // The canvas shows the boxes from the file, and they are in view.
    await waitFor(() => expect(canvas.getByLabelText('Name')).toHaveValue('From the file'));
    await expect(canvasElement.querySelectorAll('.box-income')).toHaveLength(0);
    await waitFor(() => expect(canvas.getByLabelText('Name')).toBeVisible());
    await waitFor(() => expect(JSON.parse(stored()).boxes[0].id).toBe('loaded'));
  },
};

export const SayingNoKeepsTheSetup: Story = {
  play: async ({ canvasElement }) => {
    spyOn(window, 'confirm').mockReturnValue(false);
    await waitFor(() => expect(stored()).not.toBe(''));
    const before = stored();
    await choose(canvasElement, savedSetup);
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    await expect(stored()).toBe(before);
    await expect(within(canvasElement).queryByRole('alert')).toBeNull();
  },
};

const unreadable = async (canvasElement: HTMLElement, text: string) => {
  const canvas = within(canvasElement);
  await waitFor(() => expect(stored()).not.toBe(''));
  const before = stored();
  await choose(canvasElement, text);
  const alert = await canvas.findByRole('alert');
  await expect(alert).toHaveTextContent('could not be read');
  // It never asks whether to replace the setup with something that cannot be read.
  await expect(window.confirm).not.toHaveBeenCalled();
  await expect(stored()).toBe(before);
  await fireEvent.click(within(alert).getByRole('button', { name: 'Close' }));
  await expect(canvas.queryByRole('alert')).toBeNull();
};

export const BrokenFile: Story = {
  play: ({ canvasElement }) => unreadable(canvasElement, 'this is not json'),
};

export const FileFromANewerVersion: Story = {
  play: ({ canvasElement }) => unreadable(canvasElement, JSON.stringify({ version: 99, boxes: [], wires: [] })),
};

export const BoxTypeItDoesNotKnow: Story = {
  play: ({ canvasElement }) =>
    unreadable(
      canvasElement,
      JSON.stringify({ version: 2, boxes: [{ id: 'x', type: 'spaceship', position: { x: 0, y: 0 }, data: {} }], wires: [] }),
    ),
};
