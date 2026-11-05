import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import PeriodScale from './PeriodScale';

const PHONE = '(max-width: 40rem)';
const choose = fn();
const option = (years: number, label: string, chosen = false) => ({ id: label, label, years, chosen, onChoose: () => choose(years) });

const meta: Meta<typeof PeriodScale> = {
  title: 'Components/PeriodScale',
  component: PeriodScale,
  args: {
    label: 'Simulation period',
    options: [option(5, '5 years'), option(10, '10 years'), option(20, '20 years'), option(30, '30 years'), option(52, 'To age 95', true)],
  },
  decorators: [
    (Story) => (
      <div style={{ padding: '1rem' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof PeriodScale>;

export const SaysWhatIsChosen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: 'Simulation period' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'To age 95' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: '5 years' })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(canvas.getByRole('button', { name: '20 years' }));
    await expect(choose).toHaveBeenCalledWith(20);
  },
};

// The length follows the years where there is room for it, and on a phone the shortest part would not hold its text.
export const LengthFollowsTheYears: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const widthOf = (name: string) => canvas.getByRole('button', { name }).getBoundingClientRect().width;
    if (window.matchMedia(PHONE).matches) {
      // All but the first have a line between them and the one before.
      await expect(Math.abs(widthOf('To age 95') - widthOf('5 years'))).toBeLessThanOrEqual(1.5);
      return;
    }
    await expect(widthOf('30 years')).toBeCloseTo(widthOf('10 years') * 3, -1);
    await expect(widthOf('To age 95')).toBeGreaterThan(widthOf('30 years'));
  },
};

export const EveryTextFits: Story = {
  play: async ({ canvasElement }) => {
    for (const part of within(canvasElement).getAllByRole('button')) {
      await expect(part.scrollWidth).toBeLessThanOrEqual(part.clientWidth);
    }
  },
};
