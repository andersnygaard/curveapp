import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
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
const days = Float64Array.from({ length: years }, (_, year) => (year + 0.5) * 365.25);
const paying = (level: number, from: number, until: number) =>
  Float64Array.from({ length: years }, (_, year) => (year >= from && year < until ? level : 0));
const lines = [
  { name: 'OTP', slot: 0, perMonth: paying(43_000, 15, 25) },
  { name: 'National pension', slot: 1, perMonth: paying(20_000, 15, years) },
  { name: 'Fund', slot: 2, perMonth: paying(20_000, 25, years) },
];

const summaryStock = (hasBalance: boolean): FixedStock => ({
  id: 'summary',
  name: 'All savings',
  line: hasBalance ? growing(300_000, 0.04) : () => NaN,
  summary: {
    overview: {
      hasBalance,
      deposits: Float64Array.from({ length: years + 1 }, () => 300_000),
      shield: null,
      withdrawn: 7_560_000,
      days,
      lines,
      perMonthMax: 45_000,
    },
  },
});

export const WithASummary: Story = {
  args: { player: fixedPlayer({ stocks: [summaryStock(true), fund] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'All savings' })).toBeVisible();
    await expect(canvas.getByText(/The dashed line is what is left of what you put in/)).toBeVisible();
    await expect(canvas.queryByText(/The dotted line/)).toBeNull();
    await expect(canvas.getByText(`Withdrawn in total: ${money.format(7_560_000)}`)).toBeVisible();
    await expect(canvas.getByText('Withdrawals in kroner a month')).toBeVisible();
    await expect(canvas.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['OTP', 'National pension', 'Fund']);
    // The accounts keep their own graphs below it.
    await expect(canvas.getByRole('heading', { name: 'Fund' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('canvas')).toHaveLength(2);
  },
};

// With nothing but Folketrygden there is no money to add up, so there is no total to show.
export const SummaryOfCalculatedBalances: Story = {
  args: { player: fixedPlayer({ stocks: [summaryStock(false)] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'All savings' })).toBeVisible();
    await expect(canvas.queryByText(/Median after/)).toBeNull();
    await expect(canvas.queryByText(/The dashed line/)).toBeNull();
    await expect(canvasElement.querySelector('canvas')).toBeNull();
    await expect(canvas.getByText('Withdrawals in kroner a month')).toBeVisible();
  },
};

export const SummaryWithShielding: Story = {
  args: {
    player: fixedPlayer({
      stocks: [
        {
          ...summaryStock(true),
          summary: {
            overview: {
              ...summaryStock(true).summary!.overview!,
              shield: Float64Array.from({ length: years + 1 }, (_, year) => year * 2_000),
            },
          },
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/The dotted line is the unused shielding deduction/)).toBeVisible();
  },
};

export const InNorwegian: Story = {
  globals: { language: 'no' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(within(canvasElement).getByRole('button', { name: '30 år' })).toBeVisible();
  },
};
