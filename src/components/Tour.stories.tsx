import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import Tour, { type TourStep } from './Tour';

const step = (name: string, target: string, more?: Partial<TourStep>): TourStep => ({
  title: `About ${name}`,
  text: `Some words about ${name}.`,
  target,
  ...more,
});

const threeSteps = [step('the first', '#first'), step('the second', '#second'), step('the last', '#last')];

function Page({ steps, onClose }: { steps: TourStep[]; onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ padding: '2rem' }}>
      <button id="first" type="button">
        First
      </button>
      <p id="second">The second thing, further down.</p>
      <p id="hidden" style={{ display: 'none' }}>
        Not on this screen.
      </p>
      <div id="last" style={{ marginTop: '150vh', height: '4rem', background: 'var(--line)' }} />
      {open && (
        <Tour
          steps={steps}
          onClose={() => {
            setOpen(false);
            onClose?.();
          }}
        />
      )}
    </div>
  );
}

const meta: Meta<typeof Page> = { title: 'Components/Tour', component: Page, args: { steps: threeSteps } };
export default meta;

type Story = StoryObj<typeof Page>;

const titleIs = (canvasElement: HTMLElement, name: string) =>
  waitFor(() => expect(within(canvasElement).getByRole('dialog')).toHaveAccessibleName(name), { timeout: 5000 });
const press = (canvasElement: HTMLElement, name: string) => userEvent.click(within(canvasElement).getByRole('button', { name }));
const rectOf = (selector: string, root: HTMLElement) => root.querySelector(selector)!.getBoundingClientRect();

export const WalksForwardAndBack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await titleIs(canvasElement, 'About the first');
    await expect(canvas.getByText('Step 1 of 3')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Back' })).toBeNull();

    await press(canvasElement, 'Next');
    await titleIs(canvasElement, 'About the second');
    await press(canvasElement, 'Back');
    await titleIs(canvasElement, 'About the first');
    await press(canvasElement, 'Next');
    await titleIs(canvasElement, 'About the second');
    await press(canvasElement, 'Next');
    await titleIs(canvasElement, 'About the last');
    await expect(canvas.queryByRole('button', { name: 'Skip' })).toBeNull();

    await press(canvasElement, 'Done');
    await expect(canvas.queryByRole('dialog')).toBeNull();
  },
};

export const TheSpotCoversTheTarget: Story = {
  play: async ({ canvasElement }) => {
    await titleIs(canvasElement, 'About the first');
    await waitFor(() => {
      const target = rectOf('#first', canvasElement);
      const spot = rectOf('.tour-spot', canvasElement);
      expect(spot.left).toBeLessThanOrEqual(target.left);
      expect(spot.top).toBeLessThanOrEqual(target.top);
      expect(spot.right).toBeGreaterThanOrEqual(target.right);
      expect(spot.bottom).toBeGreaterThanOrEqual(target.bottom);
    });
  },
};

export const OnlyWhatIsLitCanBeReached: Story = {
  play: async ({ canvasElement }) => {
    await titleIs(canvasElement, 'About the first');
    const middleOf = (selector: string) => {
      const { left, top, width, height } = rectOf(selector, canvasElement);
      return document.elementFromPoint(left + width / 2, top + height / 2);
    };
    await waitFor(() => expect(middleOf('#first')?.id).toBe('first'));
    await expect(document.elementFromPoint(window.innerWidth - 4, window.innerHeight - 4)?.className).toBe('tour-cover');
  },
};

export const ScrollsToTheTargetAndStaysOnScreen: Story = {
  args: { steps: [step('the last', '#last')] },
  play: async ({ canvasElement }) => {
    await titleIs(canvasElement, 'About the last');
    await waitFor(() => {
      const target = rectOf('#last', canvasElement);
      expect(target.top).toBeGreaterThanOrEqual(0);
      expect(target.bottom).toBeLessThanOrEqual(window.innerHeight);
    });
    const card = rectOf('.tour-card', canvasElement);
    await expect(card.top).toBeGreaterThanOrEqual(0);
    await expect(card.bottom).toBeLessThanOrEqual(window.innerHeight);
    await expect(card.left).toBeGreaterThanOrEqual(0);
  },
};

export const SkipsWhatIsNotOnScreen: Story = {
  args: { steps: [step('the first', '#first'), step('the hidden', '#hidden'), step('the second', '#second')] },
  play: async ({ canvasElement }) => {
    await titleIs(canvasElement, 'About the first');
    await press(canvasElement, 'Next');
    await titleIs(canvasElement, 'About the second');
    await press(canvasElement, 'Back');
    await titleIs(canvasElement, 'About the first');
  },
};

export const ClosesIfTheLastStepIsNotOnScreen: Story = {
  args: { steps: [step('the first', '#first'), step('the hidden', '#hidden')], onClose: fn() },
  play: async ({ canvasElement, args }) => {
    await titleIs(canvasElement, 'About the first');
    await press(canvasElement, 'Next');
    await waitFor(() => expect(args.onClose).toHaveBeenCalledOnce(), { timeout: 5000 });
  },
};

export const GetsThePageReady: Story = {
  args: { steps: [step('the first', '#first', { before: fn() })] },
  play: async ({ canvasElement, args }) => {
    await titleIs(canvasElement, 'About the first');
    await expect(args.steps[0].before).toHaveBeenCalled();
  },
};

export const CanStandInTheMiddle: Story = {
  args: { steps: [step('the first', '#first', { centered: true })] },
  play: async ({ canvasElement }) => {
    await titleIs(canvasElement, 'About the first');
    const { left, right } = rectOf('.tour-card', canvasElement);
    await expect(Math.abs(left + right - document.documentElement.clientWidth)).toBeLessThan(2);
  },
};

export const EscapeCloses: Story = {
  play: async ({ canvasElement }) => {
    await titleIs(canvasElement, 'About the first');
    await userEvent.keyboard('{Escape}');
    await expect(within(canvasElement).queryByRole('dialog')).toBeNull();
  },
};

export const SkipCloses: Story = {
  play: async ({ canvasElement }) => {
    await titleIs(canvasElement, 'About the first');
    await press(canvasElement, 'Skip');
    await expect(within(canvasElement).queryByRole('dialog')).toBeNull();
  },
};

export const TheKeyboardStaysInTheCard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await titleIs(canvasElement, 'About the first');
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Next' })).toHaveFocus());
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Skip' })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Next' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(canvas.getByRole('button', { name: 'Skip' })).toHaveFocus();
  },
};

export const Norwegian: Story = {
  globals: { language: 'no' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await titleIs(canvasElement, 'About the first');
    await expect(canvas.getByText('Steg 1 av 3')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Neste' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Hopp over' })).toBeVisible();
  },
};
