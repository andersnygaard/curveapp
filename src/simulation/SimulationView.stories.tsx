import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { WithdrawalSummary } from '../engine/statistics';
import { fixedPlayer, growing, type FixedStock } from './fixedPlayer';
import SimulationView from './SimulationView';

const fund: FixedStock = { id: 'fund', name: 'Fund', line: growing(100_000, 0.04) };
const format = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 });
// Intl puts a no-break space in the amount, and Testing Library reads it as a plain one.
const money = { format: (amount: number) => format.format(amount).replace(/\s/g, ' ') };

const meta: Meta<typeof SimulationView> = {
  title: 'Simulation/SimulationView',
  component: SimulationView,
  args: {
    hasAccounts: true,
    failed: false,
    player: fixedPlayer({ stocks: [fund] }),
    birthYear: null,
    yearsToLastAge: 0,
    horizon: 30,
    onHorizon: fn(),
    paused: false,
    onTogglePause: fn(),
    registerDraw: () => () => {},
  },
  decorators: [
    (Story) => (
      <div className="panel">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof SimulationView>;

export const NoAccounts: Story = {
  args: { hasAccounts: false, player: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Add an account in the Input tab to start the simulation.')).toBeVisible();
  },
};

export const Calculating: Story = {
  args: { player: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Calculating…')).toBeVisible();
  },
};

export const Failed: Story = {
  args: { failed: true, player: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('The simulation stopped because of an error.')).toBeVisible();
  },
};

export const Running: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Fund' })).toBeVisible();
    await expect(canvas.getByText(`Median after 30 years: ${money.format(growing(100_000, 0.04)(30))}`)).toBeVisible();
    await expect(canvas.getByText('Pass 3')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '30 years' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.queryByRole('button', { name: 'To age 95' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: '10 years' }));
    await expect(args.onHorizon).toHaveBeenCalledWith(10);
    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }));
    await expect(args.onTogglePause).toHaveBeenCalled();
  },
};

export const Paused: Story = {
  args: { paused: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Resume' })).toBeVisible();
  },
};

export const WithBirthYear: Story = {
  args: { birthYear: 1990, yearsToLastAge: 55 },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'To age 95' }));
    await expect(args.onHorizon).toHaveBeenCalledWith('lastAge');
  },
};

export const ToAge95: Story = {
  args: {
    player: fixedPlayer({
      years: 55,
      stocks: [fund],
      gates: [{ id: 'withdrawal', name: 'Withdrawal', heldShare: 0.847 }],
    }),
    birthYear: 1990,
    yearsToLastAge: 55,
    horizon: 'lastAge',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'To age 95' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: '30 years' })).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas.getByText(`Median at age 95: ${money.format(growing(100_000, 0.04)(55))}`)).toBeVisible();
    // Rounded down, so 100 % can only mean that every pass held.
    await expect(canvas.getByText(/Withdrawal.*84\s?%/)).toBeVisible();
  },
};

export const AllNotes: Story = {
  args: {
    player: fixedPlayer({
      stocks: [
        {
          ...fund,
          summary: { calculated: true, payoutPerYear: 120_000, heldShare: 0.5, afterTax: 250_000 },
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Calculated balance, not money. Do not add it to your savings.')).toBeVisible();
    await expect(canvas.getByText(`Paid out: about ${money.format(120_000)} a year`)).toBeVisible();
    await expect(canvas.getByText(/50\s?% of the passes last the whole period\./)).toBeVisible();
    await expect(canvas.getByText(`After tax if everything is withdrawn: ${money.format(250_000)}`)).toBeVisible();
  },
};

export const ClosesEarly: Story = {
  args: {
    player: fixedPlayer({
      stocks: [{ ...fund, summary: { closeDay: 3660, lastValue: 200_000 } }],
    }),
    birthYear: 1990,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(`Balance at age 50: ${money.format(200_000)}`)).toBeVisible();
  },
};

const years = 30;
const paying = (level: number, from: number, until: number) =>
  Float64Array.from({ length: years }, (_, year) => (year >= from && year < until ? level : 0));
const withdrawal: WithdrawalSummary = {
  id: 'living',
  name: 'Living costs',
  currency: 'NOK',
  yearEdges: Float64Array.from({ length: years + 1 }, (_, year) => year * 365.25),
  sources: [
    { name: 'OTP', slot: 0, perMonth: paying(43_000, 15, 25) },
    { name: 'National pension', slot: 1, perMonth: paying(20_000, 15, years) },
    { name: 'Fund', slot: 2, perMonth: paying(20_000, 25, years) },
  ],
  need: paying(40_000, 15, years),
  surplus: paying(23_000, 15, 25),
  short: paying(0, 0, 0),
  tax: paying(0, 0, 0),
  surplusTo: 'Fund',
  withdrawn: 7_560_000,
  taxPaid: 0,
  perMonthMax: 66_000,
};

export const WithAWithdrawal: Story = {
  args: {
    player: fixedPlayer({ stocks: [fund], withdrawals: [withdrawal], gates: [{ id: 'living', name: 'Living costs', heldShare: 0.9 }] }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole('heading', { name: 'Living costs' });
    await expect(heading).toBeVisible();
    await expect(canvas.getByText(`Paid out in total: ${money.format(7_560_000)}`)).toBeVisible();
    await expect(canvas.getByText(/Where the money comes from/)).toBeVisible();
    // It comes first, and the accounts keep their own graphs below it.
    const account = canvas.getByRole('heading', { name: 'Fund' });
    await expect(heading.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(canvasElement.querySelectorAll('canvas')).toHaveLength(1);
    await waitFor(() => expect(canvasElement.querySelectorAll('.flows-layer')).toHaveLength(3));
    await expect(canvas.getByText(/Living costs is covered for the whole period in 90\s?% of the passes\./)).toBeVisible();
  },
};

export const AWithdrawalWithTax: Story = {
  args: {
    player: fixedPlayer({
      stocks: [fund],
      withdrawals: [{ ...withdrawal, tax: paying(9_000, 15, years), taxPaid: 1_800_000, perMonthMax: 75_000 }],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(`Paid out in total: ${money.format(7_560_000)} after tax, and ${money.format(1_800_000)} in tax`)).toBeVisible();
    await waitFor(() => expect(canvasElement.querySelector('.flows-tax')).not.toBeNull());
  },
};

export const EachWithdrawalHasItsOwn: Story = {
  args: {
    player: fixedPlayer({ stocks: [fund], withdrawals: [withdrawal, { ...withdrawal, id: 'trips', name: 'Trips', surplusTo: null }] }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Living costs' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Trips' })).toBeVisible();
    await waitFor(() => expect(canvasElement.querySelectorAll('.flows-need')).toHaveLength(2));
  },
};

export const WithoutAWithdrawal: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.withdrawal')).toBeNull();
    await expect(within(canvasElement).getByText(/The thick line is the median/)).toBeVisible();
  },
};

export const AnAskShowsDepositsAndShielding: Story = {
  args: {
    player: fixedPlayer({
      stocks: [
        {
          ...fund,
          summary: {
            deposits: Float64Array.from({ length: years + 1 }, () => 100_000),
            shield: Float64Array.from({ length: years + 1 }, (_, year) => year * 2_000),
          },
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/The dashed line is what is left of what you put in/)).toBeVisible();
    await expect(canvas.getByText(/The dotted line is the unused shielding deduction/)).toBeVisible();
  },
};

export const ARegularAccountDoesNot: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/The dashed line/)).toBeNull();
    await expect(canvas.queryByText(/The dotted line/)).toBeNull();
  },
};

export const InNorwegian: Story = {
  globals: { language: 'no' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(within(canvasElement).getByRole('button', { name: '30 år' })).toBeVisible();
  },
};
