import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, spyOn, waitFor } from 'storybook/test';
import { fixedPlayer, growing } from '../simulation/fixedPlayer';
import Aurora from './Aurora';

const fund = { id: 'fund', name: 'Fund', line: growing(100_000, 0.04) };
const pension = { id: 'otp', name: 'OTP', line: () => 50_000 };

const meta: Meta<typeof Aurora> = {
  title: 'Components/Aurora',
  component: Aurora,
  args: { player: fixedPlayer({ stocks: [fund] }), index: 0, registerDraw: () => () => {} },
  decorators: [
    (Story) => (
      <div className="sim-hero" style={{ height: '20rem', margin: 0 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Aurora>;

const auroraIn = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLCanvasElement>('canvas')!;
const hasDrawn = (canvas: HTMLCanvasElement) =>
  canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);

export const DrawsThePasses: Story = {
  play: async ({ canvasElement }) => {
    const canvas = auroraIn(canvasElement);
    await waitFor(() => expect(hasDrawn(canvas)).toBe(true));
    // There is nothing here that the chart further down does not say.
    await expect(canvas).toHaveAttribute('aria-hidden', 'true');
  },
};

export const CoversTheWholeWidth: Story = {
  play: async ({ canvasElement }) => {
    const { width } = auroraIn(canvasElement).getBoundingClientRect();
    await expect(width).toBeCloseTo(canvasElement.querySelector('.sim-hero')!.getBoundingClientRect().width, 0);
  },
};

export const ShowsTheAccountItIsAskedFor: Story = {
  args: { player: fixedPlayer({ stocks: [pension, fund] }), index: 1 },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(hasDrawn(auroraIn(canvasElement))).toBe(true));
  },
};

// A canvas keeps its old colours until it is told, and it is not redrawn while the passes are paused.
export const FollowsTheLever: Story = {
  play: async ({ canvasElement }) => {
    const canvas = auroraIn(canvasElement);
    const root = document.documentElement;
    const before = root.dataset.theme;
    await waitFor(() => expect(hasDrawn(canvas)).toBe(true));
    const picture = canvas.toDataURL();
    root.dataset.theme = before === 'dark' ? 'light' : 'dark';
    await waitFor(() => expect(canvas.toDataURL()).not.toBe(picture));
    root.dataset.theme = before;
  },
};

let redraw = () => {};
const remembersDraw = (draw: () => void) => {
  redraw = draw;
  return () => {};
};

// Passes that have not been played are there too, since it would take minutes to play enough of them.
export const ShowsPassesBeforeTheyArePlayed: Story = {
  args: { player: fixedPlayer({ stocks: [fund] }) },
  play: async ({ canvasElement, args }) => {
    await expect(args.player.arrived.length).toBeGreaterThan(1);
    await waitFor(() => expect(hasDrawn(auroraIn(canvasElement))).toBe(true));
  },
};

export const ThePassBeingPlayedMoves: Story = {
  args: { player: fixedPlayer({ stocks: [fund] }), registerDraw: remembersDraw },
  play: async ({ canvasElement, args }) => {
    const canvas = auroraIn(canvasElement);
    await waitFor(() => expect(hasDrawn(canvas)).toBe(true));
    const picture = canvas.toDataURL();
    args.player.progress = 0.9;
    redraw();
    await expect(canvas.toDataURL()).not.toBe(picture);
  },
};

export const StandsStillWithoutMotion: Story = {
  args: { player: fixedPlayer({ stocks: [fund] }), registerDraw: remembersDraw },
  beforeEach: () => {
    const original = window.matchMedia.bind(window);
    const motion = spyOn(window, 'matchMedia').mockImplementation((query) =>
      query === '(prefers-reduced-motion: reduce)' ? ({ matches: true } as MediaQueryList) : original(query),
    );
    return () => motion.mockRestore();
  },
  play: async ({ canvasElement, args }) => {
    const canvas = auroraIn(canvasElement);
    await waitFor(() => expect(hasDrawn(canvas)).toBe(true));
    const picture = canvas.toDataURL();
    args.player.progress = 0.9;
    redraw();
    await expect(canvas.toDataURL()).toBe(picture);
  },
};
