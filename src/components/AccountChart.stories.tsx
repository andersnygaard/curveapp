import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { fixedPlayer, growing } from '../simulation/fixedPlayer';
import AccountChart from './AccountChart';

// --ink in styles.css, the colour only the thick line has.
const INK = [0x12, 0x26, 0x3a];
const CLOSE_TO = 6;
const START_YEAR = 20;

function inkPixels(canvas: HTMLCanvasElement, fromShare: number, toShare: number): number {
  const left = Math.floor(canvas.width * fromShare);
  const width = Math.floor(canvas.width * toShare) - left;
  const { data } = canvas.getContext('2d')!.getImageData(left, 0, width, canvas.height);
  let count = 0;
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] > 200 && INK.every((value, channel) => Math.abs(data[at + channel] - value) < CLOSE_TO)) count++;
  }
  return count;
}

const meta: Meta<typeof AccountChart> = {
  title: 'Components/AccountChart',
  component: AccountChart,
  args: {
    index: 0,
    locale: 'en-GB',
    birthYear: null,
    ageLabel: (age) => `${age} yrs`,
    description: 'Fund. Median after 30 years.',
    registerDraw: () => () => {},
  },
};
export default meta;

type Story = StoryObj<typeof AccountChart>;

export const WholePeriod: Story = {
  args: { player: fixedPlayer({ stocks: [{ id: 'fund', name: 'Fund', line: growing(100_000, 0.04) }] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img', { name: 'Fund. Median after 30 years.' });
    await waitFor(() => expect(inkPixels(canvas, 0.1, 0.5)).toBeGreaterThan(0));
    await expect(inkPixels(canvas, 0.5, 1)).toBeGreaterThan(0);
  },
};

// A pension that starts late has no line before it starts, and the gap must not be drawn as a line.
export const StartsLate: Story = {
  args: {
    player: fixedPlayer({
      stocks: [
        {
          id: 'pension',
          name: 'Pension',
          line: (year) => (year < START_YEAR ? NaN : growing(100_000, 0.04)(year - START_YEAR)),
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(inkPixels(canvas, 0.8, 1)).toBeGreaterThan(0));
    await expect(inkPixels(canvas, 0, 0.5)).toBe(0);
  },
};

// --muted in styles.css. Inside the plot, only the dashed line has it.
const MUTED = [0x56, 0x68, 0x78];

function mutedPixelsInPlot(canvas: HTMLCanvasElement): number {
  const left = Math.floor(canvas.width * 0.3);
  const { data } = canvas.getContext('2d')!.getImageData(left, 0, canvas.width - left, Math.floor(canvas.height * 0.85));
  let count = 0;
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] > 200 && MUTED.every((value, channel) => Math.abs(data[at + channel] - value) < CLOSE_TO)) count++;
  }
  return count;
}

const flatDeposits = Float64Array.from({ length: 31 }, () => 100_000);

export const WithDeposits: Story = {
  args: {
    player: fixedPlayer({
      stocks: [
        {
          id: 'both',
          name: 'Both accounts',
          line: growing(100_000, 0.04),
          summary: {
            overview: { hasBalance: true, deposits: flatDeposits, shield: null, withdrawn: 0, days: new Float64Array(31), lines: [], perMonthMax: 1 },
          },
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(mutedPixelsInPlot(canvas)).toBeGreaterThan(0));
  },
};

// --series-7 in styles.css. Nothing else in this chart has it.
const VIOLET = [0x62, 0x50, 0xd6];

function violetPixels(canvas: HTMLCanvasElement): number {
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] > 100 && VIOLET.every((value, channel) => Math.abs(data[at + channel] - value) < 40)) count++;
  }
  return count;
}

export const WithShielding: Story = {
  args: {
    player: fixedPlayer({
      stocks: [
        {
          id: 'both',
          name: 'Both accounts',
          line: growing(100_000, 0.04),
          summary: {
            overview: {
              hasBalance: true,
              deposits: flatDeposits,
              shield: Float64Array.from({ length: 31 }, (_, year) => year * 1_000),
              withdrawn: 0,
              days: new Float64Array(31),
              lines: [],
              perMonthMax: 1,
            },
          },
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(violetPixels(canvas)).toBeGreaterThan(0));
  },
};

export const WithoutShielding: Story = {
  args: WithDeposits.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(mutedPixelsInPlot(canvas)).toBeGreaterThan(0));
    await expect(violetPixels(canvas)).toBe(0);
  },
};
