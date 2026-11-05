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

const home: PlanLine = {
  flow: 'housing',
  change: 'starts',
  from: 'Home',
  to: null,
  amount: 3_000_000,
  lastAmount: 3_000_000,
  every: 'once',
  currency: 'NOK',
  loan: 1_500_000,
};

const withHousing: Plan = {
  ...plan,
  dates: [
    {
      day: 0,
      dateMs: Date.UTC(2030, 0, 1),
      age: null,
      lines: [home, { ...home, from: 'Cabin', amount: 800_000, lastAmount: 800_000, loan: 0 }],
      balances: [],
    },
    {
      day: 3650,
      dateMs: Date.UTC(2040, 0, 1),
      age: 50,
      lines: [{ ...home, change: 'stops', loan: undefined }],
      balances: [{ name: 'Fund', amount: 1_234_567, currency: 'NOK' }],
    },
  ],
};

export const Housing: Story = {
  args: { plan: withHousing },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/^Home is worth NOK\s?3,000,000, with a loan of NOK\s?1,500,000$/)).toBeVisible();
    // Without a loan there is nothing to say about one.
    await expect(canvas.getByText(/^Cabin is worth NOK\s?800,000$/)).toBeVisible();
    await expect(canvas.getByText('The loan on Home is paid off')).toBeVisible();
  },
};

export const HousingInNorwegian: Story = {
  args: { plan: withHousing },
  globals: { language: 'no' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/^Home er verdt 3\s000\s000\skr, med lån på 1\s500\s000\skr$/)).toBeVisible();
    await expect(canvas.getByText(/^Cabin er verdt 800\s000\skr$/)).toBeVisible();
    await expect(canvas.getByText('Lånet på Home er nedbetalt')).toBeVisible();
  },
};

const wealthTaxLine = (flow: PlanLine['flow'], amount: number, lastAmount: number): PlanLine => ({
  flow,
  change: 'starts',
  from: null,
  to: null,
  amount,
  lastAmount,
  every: 'yearly',
  currency: 'NOK',
});

const withWealthTax: Plan = {
  ...plan,
  dates: [
    {
      day: 0,
      dateMs: Date.UTC(2030, 11, 31),
      age: null,
      lines: [wealthTaxLine('wealthTax', 5_000, 61_000), wealthTaxLine('wealthTaxGain', 1_000, 20_000), wealthTaxLine('wealthTaxShort', 30_000, 58_000)],
      balances: [{ name: 'Fund', amount: 1_234_567, currency: 'NOK' }],
    },
    {
      day: 3650,
      dateMs: Date.UTC(2040, 11, 31),
      age: null,
      lines: [
        { ...wealthTaxLine('wealthTax', 5_000, 61_000), change: 'stops' },
        { ...wealthTaxLine('wealthTaxShort', 30_000, 58_000), change: 'stops' },
      ],
      balances: [],
    },
  ],
};

export const WealthTax: Story = {
  args: { plan: withWealthTax },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/^Wealth tax is NOK\s?5,000.*61,000 a year$/)).toBeVisible();
    await expect(canvas.getByText(/^Tax on gains to pay the wealth tax is NOK\s?1,000.*20,000 a year$/)).toBeVisible();
    await expect(canvas.getByText(/^Wealth tax is short by NOK\s?30,000.*58,000 a year$/)).toHaveClass('plan-short');
    await expect(canvas.getByText('Wealth tax stops')).toBeVisible();
    await expect(canvas.getByText('Wealth tax is covered again')).not.toHaveClass('plan-short');
  },
};

export const WealthTaxInNorwegian: Story = {
  args: { plan: withWealthTax },
  globals: { language: 'no' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/^Formuesskatt er 5\s000.*61\s000\skr i året$/)).toBeVisible();
    await expect(canvas.getByText(/^Skatt på gevinst for å betale formuesskatten er /)).toBeVisible();
    await expect(canvas.getByText(/^Formuesskatt mangler 30\s000.*58\s000\skr i året$/)).toHaveClass('plan-short');
    await expect(canvas.getByText('Formuesskatt stopper')).toBeVisible();
    await expect(canvas.getByText('Formuesskatt er dekket igjen')).toBeVisible();
  },
};

export const ToAge: Story = {
  args: { plan: { ...plan, toAge: 95 } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/The plan runs to age 95\./)).toBeVisible();
  },
};
