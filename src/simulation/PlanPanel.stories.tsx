import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { Plan, PlanLine } from '../model/plan';
import { PlanView } from './PlanPanel';

const saving: PlanLine = {
  flow: 'deposit',
  change: 'starts',
  from: 'Salary',
  to: 'Fund',
  amount: 5_000,
  lastAmount: 5_000,
  every: 'monthly',
  currency: 'NOK',
};

const plan: Plan = {
  years: 30,
  toAge: null,
  dates: [
    {
      day: 0,
      dateMs: Date.UTC(2030, 0, 1),
      age: null,
      lines: [saving],
      balances: [],
    },
    {
      day: 3650,
      dateMs: Date.UTC(2040, 0, 1),
      age: 50,
      lines: [{ ...saving, flow: 'unmet', from: 'Withdrawal', to: null, amount: 12_340, lastAmount: 15_660 }],
      balances: [{ name: 'Fund', amount: 1_234_567, currency: 'NOK' }],
    },
  ],
};

const meta: Meta<typeof PlanView> = {
  title: 'Simulation/PlanView',
  component: PlanView,
  args: { plan, failed: false },
};
export default meta;

type Story = StoryObj<typeof PlanView>;

// A narrow screen has no plan button in reach while the plan lies over the page, so it closes from here.
// On a wide screen the button on the tab row is always in reach, so this one stays away.
export const CanBeClosedOnANarrowScreen: Story = {
  args: { onClose: fn() },
  play: async ({ canvasElement, args }) => {
    const close = within(canvasElement).queryByRole('button', { name: 'Close the plan' });
    if (window.matchMedia('(min-width: 60.01rem)').matches) {
      await expect(close).toBeNull();
      return;
    }
    await userEvent.click(close!);
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const Calculating: Story = {
  args: { plan: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Calculating…')).toBeVisible();
  },
};

export const Failed: Story = {
  args: { plan: null, failed: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('The simulation stopped because of an error.')).toBeVisible();
  },
};

export const Empty: Story = {
  args: { plan: { ...plan, dates: [] } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('The plan appears when there is an account or a pension on the canvas.'),
    ).toBeVisible();
  },
};

export const TwoDates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('complementary', { name: 'Plan' })).toBeVisible();
    await expect(canvas.getAllByRole('heading', { level: 3 })).toHaveLength(2);
    await expect(canvas.getByText(/The plan runs for 30 years\./)).toBeVisible();
    await expect(canvas.getByText('50 yrs')).toBeVisible();
    // Three significant digits, so it does not look more exact than it is.
    await expect(canvas.getByText(/Fund NOK\s?1,230,000/)).toBeVisible();
    // Payments are rounded to hundreds, and a payment that changes is shown as a range.
    await expect(canvas.getByText(/12,300.*15,700/)).toHaveClass('plan-short');
  },
};

export const ToAge: Story = {
  args: { plan: { ...plan, toAge: 95 } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/The plan runs to age 95\./)).toBeVisible();
  },
};
