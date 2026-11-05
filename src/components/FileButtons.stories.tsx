import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, spyOn, userEvent, waitFor, within } from 'storybook/test';
import FileButtons from './FileButtons';

const meta: Meta<typeof FileButtons> = {
  title: 'Components/FileButtons',
  component: FileButtons,
  args: { fileName: () => 'curve-2030-01-15.json', contents: () => '{"made":"up"}', onLoad: fn(), onReset: fn() },
};
export default meta;

type Story = StoryObj<typeof FileButtons>;

export const Saving: Story = {
  play: async ({ canvasElement }) => {
    const created = spyOn(URL, 'createObjectURL');
    let downloaded = '';
    const click = spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Save the setup as a file' }));
    await expect(downloaded).toBe('curve-2030-01-15.json');
    const blob = created.mock.calls[0][0] as Blob;
    await expect(await blob.text()).toBe('{"made":"up"}');
    await expect(blob.type).toBe('application/json');
    click.mockRestore();
    created.mockRestore();
  },
};

export const Loading: Story = {
  play: async ({ canvasElement, args }) => {
    const input = canvasElement.querySelector<HTMLInputElement>('input[type=file]')!;
    const file = new File(['{"made":"up"}'], 'setup.json', { type: 'application/json' });
    await userEvent.upload(input, file);
    await waitFor(() => expect(args.onLoad).toHaveBeenCalledWith('{"made":"up"}'));
    // The same file again counts as a new choice, for instance after it has been edited.
    await waitFor(() => expect(input.value).toBe(''));
    await userEvent.upload(input, file);
    await waitFor(() => expect(args.onLoad).toHaveBeenCalledTimes(2));
  },
};

export const LoadOpensThePicker: Story = {
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>('input[type=file]')!;
    const click = spyOn(input, 'click').mockImplementation(() => {});
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Load a setup from a file' }));
    await expect(click).toHaveBeenCalled();
    click.mockRestore();
  },
};

// It only says that it was pressed, since what to do about it is not for a button to decide.
export const Resetting: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Go back to the default setup' }));
    await expect(args.onReset).toHaveBeenCalled();
    await expect(args.onLoad).not.toHaveBeenCalled();
  },
};

export const InNorwegian: Story = {
  globals: { language: 'no' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Lagre oppsettet som fil' })).toHaveTextContent('Lagre');
    await expect(canvas.getByRole('button', { name: 'Last inn et oppsett fra fil' })).toHaveTextContent('Last inn');
    await expect(canvas.getByRole('button', { name: 'Gå tilbake til standardoppsettet' })).toHaveTextContent('Nullstill');
  },
};
