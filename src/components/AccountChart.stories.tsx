import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { fixedPlayer, growing } from '../simulation/fixedPlayer';
import AccountChart from './AccountChart';
import { MARGIN } from './chartAxis';

const CLOSE_TO = 6;
const START_YEAR = 20;
// The values the stories look at have no line of the grid on them, since this scale gives one every 50 000.
const SCALE_TOP = 200_000;

// A colour as it is in the stylesheet right now, since the stories run in both sets of colours.
function colourOf(canvas: HTMLCanvasElement, name: string): number[] {
  const hex = getComputedStyle(canvas).getPropertyValue(name).trim().slice(1);
  return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
}

// --curve is the colour only the bands have, and they are see-through.
function curvePixels(canvas: HTMLCanvasElement, fromShare: number, toShare: number): number {
  const CURVE = colourOf(canvas, '--curve');
  const left = Math.floor(canvas.width * fromShare);
  const width = Math.floor(canvas.width * toShare) - left;
  const { data } = canvas.getContext('2d')!.getImageData(left, 0, width, canvas.height);
  let count = 0;
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] > 0 && CURVE.every((value, channel) => Math.abs(data[at + channel] - value) < 40)) count++;
  }
  return count;
}

// How strongly the plot is covered at a value, so 0 is empty. Half way along, where the time axis has no text.
function coverageAt(canvas: HTMLCanvasElement, value: number): number {
  const ratio = canvas.width / canvas.clientWidth;
  const plotHeight = canvas.clientHeight - MARGIN.top - MARGIN.bottom;
  const y = Math.round((MARGIN.top + plotHeight * (1 - value / SCALE_TOP)) * ratio);
  return canvas.getContext('2d')!.getImageData(Math.floor(canvas.width / 2), y, 1, 1).data[3];
}

const flat = (value: number) => Float64Array.from({ length: 31 }, () => value);
const bandsAround100k = () =>
  fixedPlayer({
    stocks: [
      {
        id: 'fund',
        name: 'Fund',
        line: () => 100_000,
        summary: {
          yMax: SCALE_TOP,
          spread: { p10: flat(60_000), p25: flat(80_000), p75: flat(120_000), p90: flat(140_000) },
        },
      },
    ],
  });

// --ink is the colour only the thick line has.
function inkPixels(canvas: HTMLCanvasElement, fromShare: number, toShare: number): number {
  const INK = colourOf(canvas, '--ink');
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

// The inner band is stronger than the outer one, and outside them there is nothing.
export const ShowsTheBands: Story = {
  args: { player: bandsAround100k() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(coverageAt(canvas, 110_000)).toBeGreaterThan(0));
    const inner = coverageAt(canvas, 110_000);
    const outer = coverageAt(canvas, 130_000);
    await expect(outer).toBeGreaterThan(0);
    await expect(inner).toBeGreaterThan(outer);
    await expect(coverageAt(canvas, 70_000)).toBe(outer);
    await expect(coverageAt(canvas, 90_000)).toBe(inner);
    await expect(coverageAt(canvas, 165_000)).toBe(0);
    await expect(coverageAt(canvas, 35_000)).toBe(0);
  },
};

// The single passes are for the lines behind the headline, so they do not show here, even outside the bands.
export const LeavesOutTheSinglePasses: Story = {
  args: {
    player: fixedPlayer({
      stocks: [
        {
          id: 'fund',
          name: 'Fund',
          line: () => 100_000,
          summary: {
            yMax: SCALE_TOP,
            spread: { p10: flat(95_000), p25: flat(98_000), p75: flat(102_000), p90: flat(105_000) },
          },
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(coverageAt(canvas, 104_000)).toBeGreaterThan(0));
    // The single passes in the player lie at 70 % and 130 % of the median.
    await expect(coverageAt(canvas, 130_000)).toBe(0);
    await expect(coverageAt(canvas, 70_000)).toBe(0);
  },
};

// Two stretches with nothing between them. They must not be joined across the gap.
export const ABandWithAGap: Story = {
  args: {
    player: fixedPlayer({
      stocks: [
        {
          id: 'fund',
          name: 'Fund',
          line: (year) => (year >= 10 && year < 20 ? NaN : 100_000),
          summary: { yMax: SCALE_TOP },
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(curvePixels(canvas, 0.75, 0.95)).toBeGreaterThan(0));
    await expect(curvePixels(canvas, 0.25, 0.3)).toBeGreaterThan(0);
    await expect(curvePixels(canvas, 0.45, 0.6)).toBe(0);
  },
};

let redraw = () => {};
const remembersDraw = (draw: () => void) => {
  redraw = draw;
  return () => {};
};

// The bands get sharper while the passes come in, also when nothing else on the page moves.
export const FollowsSharperNumbers: Story = {
  args: { player: bandsAround100k(), registerDraw: remembersDraw },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(coverageAt(canvas, 110_000)).toBeGreaterThan(0));
    const { summary } = args.player;
    const [stock] = summary.stocks;
    const picture = canvas.toDataURL();

    // Called on every frame while the passes play, so with nothing new it leaves the picture alone.
    redraw();
    await expect(canvas.toDataURL()).toBe(picture);

    args.player.summary = {
      ...summary,
      passes: summary.passes + 1,
      stocks: [{ ...stock, spread: { ...stock.spread, p90: flat(170_000) } }],
    };
    redraw();
    await expect(coverageAt(canvas, 165_000)).toBeGreaterThan(0);
    args.player.summary = summary;
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
    await expect(curvePixels(canvas, 0, 0.5)).toBe(0);
    await expect(curvePixels(canvas, 0.8, 1)).toBeGreaterThan(0);
  },
};

// Inside the plot, only the dashed line has --muted.
function mutedPixelsInPlot(canvas: HTMLCanvasElement): number {
  const MUTED = colourOf(canvas, '--muted');
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
          id: 'fund',
          name: 'Fund',
          line: growing(100_000, 0.04),
          summary: { deposits: flatDeposits },
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(mutedPixelsInPlot(canvas)).toBeGreaterThan(0));
  },
};

// Nothing else in this chart has --series-6.
function shieldPixels(canvas: HTMLCanvasElement): number {
  const SHIELD = colourOf(canvas, '--series-6');
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] > 100 && SHIELD.every((value, channel) => Math.abs(data[at + channel] - value) < 40)) count++;
  }
  return count;
}

export const WithShielding: Story = {
  args: {
    player: fixedPlayer({
      stocks: [
        {
          id: 'fund',
          name: 'Fund',
          line: growing(100_000, 0.04),
          summary: {
            deposits: flatDeposits,
            shield: Float64Array.from({ length: 31 }, (_, year) => year * 1_000),
          },
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(shieldPixels(canvas)).toBeGreaterThan(0));
  },
};

export const WithoutShielding: Story = {
  args: WithDeposits.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    await waitFor(() => expect(mutedPixelsInPlot(canvas)).toBeGreaterThan(0));
    await expect(shieldPixels(canvas)).toBe(0);
  },
};

// A canvas keeps its old colours until it is told, and it is not redrawn while the passes are paused.
export const FollowsTheLever: Story = {
  args: WholePeriod.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement).getByRole<HTMLCanvasElement>('img');
    const root = document.documentElement;
    const before = root.dataset.theme;
    await waitFor(() => expect(inkPixels(canvas, 0.1, 0.5)).toBeGreaterThan(0));
    const picture = canvas.toDataURL();
    root.dataset.theme = before === 'dark' ? 'light' : 'dark';
    await waitFor(() => expect(canvas.toDataURL()).not.toBe(picture));
    await waitFor(() => expect(inkPixels(canvas, 0.1, 0.5)).toBeGreaterThan(0));
    root.dataset.theme = before;
  },
};
