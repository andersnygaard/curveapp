import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, waitFor, within } from 'storybook/test';
import WithdrawalsChart from './WithdrawalsChart';

const YEARS = 31;
const days = Float64Array.from({ length: YEARS }, (_, year) => (year + 0.5) * 365.25);
const paying = (level: number, from = 0, until = YEARS) =>
  Float64Array.from({ length: YEARS }, (_, year) => (year >= from && year < until ? level : 0));
const line = (name: string, slot: number, perMonth = paying(10_000)) => ({ name, slot, perMonth });

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 });
const amount = (value: number) => money.format(value).replace(/\s/g, ' ');

const meta: Meta<typeof WithdrawalsChart> = {
  title: 'Components/WithdrawalsChart',
  component: WithdrawalsChart,
  args: {
    title: 'Withdrawals in kroner a month',
    otherLabel: 'Other',
    days,
    yMax: 50_000,
    startMs: Date.UTC(2030, 0, 1),
    totalDays: YEARS * 365.25,
    birthYear: null,
    locale: 'en-GB',
    currency: 'NOK',
    ageLabel: (age) => `${age} yrs`,
  },
};
export default meta;

type Story = StoryObj<typeof WithdrawalsChart>;

const plotted = (canvasElement: HTMLElement) => {
  const svg = () => canvasElement.querySelector('svg')!;
  return waitFor(() => expect(svg()).not.toBeNull()).then(svg);
};

export const OneBox: Story = {
  args: { lines: [line('OTP', 0)] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await plotted(canvasElement);
    // One line needs no legend, so the title says what it is.
    await expect(canvas.getByText('Withdrawals in kroner a month: OTP')).toBeVisible();
    await expect(canvas.queryByRole('listitem')).toBeNull();
    await expect(canvasElement.querySelector('.flows-label')).toBeNull();
  },
};

export const ThreeBoxes: Story = {
  args: {
    lines: [line('OTP', 0, paying(43_000, 15, 25)), line('National pension', 1, paying(20_000, 15)), line('Fund', 2, paying(20_000, 25))],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await plotted(canvasElement);
    await expect(canvas.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['OTP', 'National pension', 'Fund']);
    await expect(canvasElement.querySelectorAll('.flows-line')).toHaveLength(3);
    await expect(canvasElement.querySelectorAll('.flows-label')).toHaveLength(3);
    await expect(canvas.getByRole('img')).toHaveAccessibleName(expect.stringContaining('OTP'));
  },
};

// Two lines stopping at the same level must not have their names on top of each other.
export const NamesDoNotCollide: Story = {
  args: { lines: [line('OTP', 0, paying(20_000)), line('Fund', 1, paying(20_000)), line('Other fund', 2, paying(20_000))] },
  play: async ({ canvasElement }) => {
    await plotted(canvasElement);
    const boxes = [...canvasElement.querySelectorAll('.flows-label')].map((label) => label.getBoundingClientRect());
    await expect(boxes).toHaveLength(3);
    for (const [index, box] of boxes.entries()) {
      for (const other of boxes.slice(index + 1)) {
        await expect(box.bottom <= other.top || other.bottom <= box.top).toBe(true);
      }
    }
  },
};

export const OnlyWhileItPays: Story = {
  args: { lines: [line('OTP', 0, paying(43_000, 15, 25))] },
  play: async ({ canvasElement }) => {
    await plotted(canvasElement);
    const path = canvasElement.querySelector('.flows-line')!.getAttribute('d')!;
    // Ten years of paying, and one point each way down to nothing. No line along the bottom for the other twenty.
    await expect(path.match(/[ML]/g)).toHaveLength(12);
  },
};

// A box keeps its colour when a box before it never pays.
export const KeepsItsColour: Story = {
  args: { lines: [line('Fund', 2)] },
  play: async ({ canvasElement }) => {
    await plotted(canvasElement);
    await expect(canvasElement.querySelector('.flows-line')).toHaveClass('series-3');
  },
};

export const ManyBoxes: Story = {
  args: { lines: Array.from({ length: 9 }, (_, slot) => line(`Box ${slot + 1}`, slot, paying(1_000 * (slot + 1)))) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const svg = await plotted(canvasElement);
    // Eight colours, so the eighth and ninth box share "Other" rather than a colour being used twice.
    await expect(canvas.getAllByRole('listitem')).toHaveLength(8);
    await expect(canvas.getByText('Other')).toBeVisible();
    await expect(canvas.queryByText('Box 9')).toBeNull();
    await expect(canvasElement.querySelectorAll('.flows-label')).toHaveLength(0);

    const { left, width } = svg.getBoundingClientRect();
    await fireEvent.pointerMove(svg, { clientX: left + width / 2 });
    await waitFor(() => expect(canvasElement.querySelector('.flows-tooltip')).toHaveTextContent(`Other${amount(17_000)}`));
  },
};

export const Hovering: Story = {
  args: { lines: [line('OTP', 0, paying(43_000)), line('Fund', 1, paying(20_000))] },
  play: async ({ canvasElement }) => {
    const svg = await plotted(canvasElement);
    await expect(canvasElement.querySelector('.flows-tooltip')).toBeNull();
    const { left, width } = svg.getBoundingClientRect();

    await fireEvent.pointerMove(svg, { clientX: left + width - 12 });
    const tooltip = await within(canvasElement).findByRole('status');
    await expect(tooltip).toHaveTextContent('2060');
    await expect(tooltip).toHaveTextContent(`OTP${amount(43_000)}`);
    await expect(tooltip).toHaveTextContent(`Fund${amount(20_000)}`);
    await expect(canvasElement.querySelectorAll('.flows-dot')).toHaveLength(2);
    // Near the right edge it stays inside the chart.
    await expect(tooltip.getBoundingClientRect().right).toBeLessThanOrEqual(left + width + 0.5);

    await fireEvent.pointerOut(svg);
    await waitFor(() => expect(canvasElement.querySelector('.flows-tooltip')).toBeNull());
  },
};

export const AsAges: Story = {
  args: { lines: [line('OTP', 0), line('Fund', 1)], birthYear: 1990 },
  play: async ({ canvasElement }) => {
    const svg = await plotted(canvasElement);
    await expect(within(canvasElement).getByText('50 yrs')).toBeVisible();
    await fireEvent.pointerMove(svg, { clientX: svg.getBoundingClientRect().right - 12 });
    await expect(await within(canvasElement).findByRole('status')).toHaveTextContent('70 yrs');
  },
};
