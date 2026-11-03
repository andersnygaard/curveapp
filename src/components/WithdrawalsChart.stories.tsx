import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, waitFor, within } from 'storybook/test';
import WithdrawalsChart from './WithdrawalsChart';

const YEARS = 31;
const yearEdges = Float64Array.from({ length: YEARS + 1 }, (_, year) => year * 365.25);
const paying = (level: number, from = 0, until = YEARS) =>
  Float64Array.from({ length: YEARS }, (_, year) => (year >= from && year < until ? level : 0));
const source = (name: string, slot: number, perMonth = paying(10_000)) => ({ name, slot, perMonth });
const nothing = paying(0);

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 });
const amount = (value: number) => money.format(value).replace(/\s/g, ' ');

const meta: Meta<typeof WithdrawalsChart> = {
  title: 'Components/WithdrawalsChart',
  component: WithdrawalsChart,
  args: {
    title: 'Where the money comes from',
    labels: { other: 'Other', need: 'Need', surplus: 'Left over', surplusGoesOn: 'Goes on to Fund', short: 'Missing', tax: 'Tax' },
    yearEdges,
    surplus: nothing,
    short: nothing,
    tax: nothing,
    yMax: 70_000,
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

// The top of an area, read from where its path goes. The smaller the number, the higher up the screen.
const yValues = (path: Element) => [...path.getAttribute('d')!.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((match) => Number(match[1]));

// As in a real plan: a fund until the pensions start, and more than is needed while they both pay.
const fundBetweenThePensions = Float64Array.from({ length: YEARS }, (_, year) => (year < 5 ? 0 : year < 12 ? 40_000 : year < 22 ? 0 : 18_000));
const pensionsAndFund = {
  sources: [source('OTP', 0, paying(39_000, 12, 22)), source('National pension', 1, paying(22_000, 12)), source('Fund', 2, fundBetweenThePensions)],
  need: paying(40_000, 5),
  surplus: paying(21_000, 12, 22),
};

export const Stacked: Story = {
  args: pensionsAndFund,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await plotted(canvasElement);
    await expect(canvasElement.querySelectorAll('.flows-layer')).toHaveLength(3);
    await expect(canvas.getByRole('img')).toHaveAccessibleName(expect.stringContaining('Need NOK'));
    await expect(canvas.getByRole('img')).toHaveAccessibleName(expect.stringContaining('OTP'));
  },
};

// One stands on the other, so together they reach the sum and not the highest of them.
export const LayersStandOnEachOther: Story = {
  args: { sources: [source('OTP', 0, paying(20_000)), source('Fund', 1, paying(30_000))], need: paying(50_000), yMax: 50_000 },
  play: async ({ canvasElement }) => {
    await plotted(canvasElement);
    const [otp, fund] = canvasElement.querySelectorAll('.flows-edge');
    const top = canvasElement.querySelector('.flows-need')!;
    await expect(Math.min(...yValues(otp))).toBeGreaterThan(Math.min(...yValues(fund)));
    await expect(Math.min(...yValues(fund))).toBeCloseTo(Math.min(...yValues(top)), 0);
    await expect(canvasElement.querySelector('.flows-surplus')).toBeNull();
    await expect(canvasElement.querySelector('.flows-short')).toBeNull();
  },
};

export const WhatGoesBeyondTheNeedIsHatched: Story = {
  args: pensionsAndFund,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await plotted(canvasElement);
    const surplus = canvasElement.querySelector('.flows-surplus')!;
    await expect(surplus.getAttribute('fill')).toMatch(/^url\(#.+-surplus\)$/);
    const pattern = canvasElement.querySelector(surplus.getAttribute('fill')!.slice(4, -1));
    await expect(pattern?.tagName.toLowerCase()).toBe('pattern');
    await expect(canvas.getByText('Left over')).toBeVisible();
    await expect(canvasElement.querySelector('.flows-short')).toBeNull();
  },
};

export const WhatIsMissingIsHatchedInAnotherWay: Story = {
  args: { sources: [source('Fund', 0, paying(40_000, 0, 15))], need: paying(40_000), short: paying(40_000, 15) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await plotted(canvasElement);
    await expect(canvasElement.querySelector('.flows-short')!.getAttribute('fill')).toMatch(/-short\)$/);
    await expect(canvasElement.querySelector('.flows-surplus')).toBeNull();
    await expect(canvas.getByText('Missing')).toBeVisible();
  },
};

export const TheNeedLineStartsWhenTheNeedDoes: Story = {
  args: pensionsAndFund,
  play: async ({ canvasElement }) => {
    await plotted(canvasElement);
    const need = canvasElement.querySelector('.flows-need')!;
    const { left } = need.getBoundingClientRect();
    const { left: plotLeft, width } = canvasElement.querySelector('svg')!.getBoundingClientRect();
    // Five of the 31 years go by first, and the plot starts a little way into the picture.
    await expect(left - plotLeft).toBeGreaterThan((width * 5) / YEARS);
    await expect(within(canvasElement).getByText(`Need ${amount(40_000)}`)).toBeVisible();
  },
};

// A step that took a whole year would look like a slow decline, so it only takes a few pixels.
export const YearsAreFlatAndStepsAreShort: Story = {
  args: { sources: [source('Fund', 0, paying(40_000, 5, 10))], need: paying(40_000, 5, 10) },
  play: async ({ canvasElement }) => {
    await plotted(canvasElement);
    const path = canvasElement.querySelector('.flows-edge')!.getAttribute('d')!;
    const points = [...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
    const [low, high] = [Math.max(...points.map(([, y]) => y)), Math.min(...points.map(([, y]) => y))];
    const stepping = points.filter(([, y]) => y > high && y < low).map(([x]) => x);
    const widest = Math.max(...stepping) - Math.min(...stepping);
    const { width } = canvasElement.querySelector('svg')!.getBoundingClientRect();
    // Two steps, so the slanted parts lie five years apart and are short each.
    const before = stepping.filter((x) => x < (Math.min(...stepping) + Math.max(...stepping)) / 2);
    await expect(Math.max(...before) - Math.min(...before)).toBeLessThanOrEqual(10);
    await expect(widest).toBeGreaterThan(width / 10);
  },
};

// The tax is on top of everything, so the whole height is what has to be found.
export const TheTaxLiesOnTop: Story = {
  args: {
    sources: [source('Fund', 0, paying(40_000))],
    need: paying(40_000),
    tax: paying(10_000),
    yMax: 60_000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const svg = await plotted(canvasElement);
    const tax = canvasElement.querySelector('.flows-tax')!;
    const need = canvasElement.querySelector('.flows-need')!;
    await expect(Math.max(...yValues(tax))).toBeCloseTo(Math.min(...yValues(need)), 0);
    await expect(Math.min(...yValues(tax))).toBeLessThan(Math.min(...yValues(need)));
    await expect(canvas.getByText('Tax')).toBeVisible();
    await expect(canvasElement.querySelector('.flows-surplus')).toBeNull();

    const { left, width } = svg.getBoundingClientRect();
    await fireEvent.pointerMove(svg, { clientX: left + width / 2 });
    await expect(await canvas.findByRole('status')).toHaveTextContent(`Tax${amount(10_000)}`);
  },
};

// Above what is left over as well, and not on top of it in a way that hides it.
export const TheTaxLiesAboveWhatIsLeftOver: Story = {
  args: {
    sources: [source('Pension', 0, paying(60_000))],
    need: paying(40_000),
    surplus: paying(20_000),
    tax: paying(5_000),
  },
  play: async ({ canvasElement }) => {
    await plotted(canvasElement);
    const surplus = canvasElement.querySelector('.flows-surplus')!;
    const tax = canvasElement.querySelector('.flows-tax')!;
    await expect(Math.max(...yValues(tax))).toBeCloseTo(Math.min(...yValues(surplus)), 0);
  },
};

export const NoTaxNoLayer: Story = {
  args: { sources: [source('Fund', 0, paying(40_000))], need: paying(40_000) },
  play: async ({ canvasElement }) => {
    const svg = await plotted(canvasElement);
    await expect(canvasElement.querySelector('.flows-tax')).toBeNull();
    const { left, width } = svg.getBoundingClientRect();
    await fireEvent.pointerMove(svg, { clientX: left + width / 2 });
    await expect(await within(canvasElement).findByRole('status')).not.toHaveTextContent('Tax');
  },
};

export const NamesSitInTheLayers: Story = {
  args: { sources: [source('OTP', 0, paying(20_000)), source('Fund', 1, paying(20_000))], need: paying(40_000), yMax: 50_000 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await plotted(canvasElement);
    await expect(canvas.queryByRole('listitem')).toBeNull();

    // Inside the band, between the top of the layer and its bottom.
    const name = canvas.getByText('Fund').getBoundingClientRect();
    const layer = canvasElement.querySelector('.flows-layer.series-2')!.getBoundingClientRect();
    await expect(name.top).toBeGreaterThanOrEqual(layer.top);
    await expect(name.bottom).toBeLessThanOrEqual(layer.bottom);
  },
};

// The part under the need is the one with the colour to itself, so the name goes there and not in the hatching.
export const ANamePrefersThePartUnderTheNeed: Story = {
  args: { sources: [source('Fund', 0, paying(60_000))], need: paying(30_000), surplus: paying(30_000) },
  play: async ({ canvasElement }) => {
    await plotted(canvasElement);
    const name = within(canvasElement).getByText('Fund').getBoundingClientRect();
    await expect(name.top).toBeGreaterThanOrEqual(canvasElement.querySelector('.flows-need')!.getBoundingClientRect().top);
  },
};

// Otherwise a box would leave a coloured line along the bottom in all the years it does not pay.
export const ABoxThatIsNotPayingDrawsNoLine: Story = {
  args: { sources: [source('Fund', 0, paying(40_000, 10, 20))], need: paying(40_000), short: paying(40_000, 0, 10) },
  play: async ({ canvasElement }) => {
    const svg = await plotted(canvasElement);
    const edge = canvasElement.querySelector('.flows-edge')!.getBoundingClientRect();
    const { left, width } = svg.getBoundingClientRect();
    const plotWidth = width - 64 - 10;
    await expect(edge.left - left).toBeGreaterThan(64 + (plotWidth * 9) / YEARS);
    await expect(edge.right - left).toBeLessThan(64 + (plotWidth * 21) / YEARS);
  },
};

// What goes beyond the need is greyed out, so no coloured line runs through the hatching.
export const ColouredLinesStopAtTheNeed: Story = {
  args: { sources: [source('Fund', 0, paying(60_000))], need: paying(30_000), surplus: paying(30_000) },
  play: async ({ canvasElement }) => {
    await plotted(canvasElement);
    const [edge] = yValues(canvasElement.querySelector('.flows-edge')!);
    const [need] = yValues(canvasElement.querySelector('.flows-need')!);
    await expect(edge).toBeCloseTo(need, 0);
  },
};

// A layer too thin to hold its name gets it in the legend, so it is never without one.
export const ANameThatDoesNotFitGoesInTheLegend: Story = {
  args: {
    sources: [source('A rather small pension with a long name', 0, paying(400)), source('Fund', 1, paying(39_600))],
    need: paying(40_000),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await plotted(canvasElement);
    const legend = canvas.getAllByRole('listitem').map((item) => item.textContent);
    await expect(legend).toEqual(['A rather small pension with a long name']);
    await expect(canvasElement.querySelector('.flows-name')).toHaveTextContent('Fund');
  },
};

// A box keeps its colour when a box before it never pays.
export const KeepsItsColour: Story = {
  args: { sources: [source('Fund', 2)], need: paying(10_000) },
  play: async ({ canvasElement }) => {
    await plotted(canvasElement);
    await expect(canvasElement.querySelector('.flows-layer')).toHaveClass('series-3');
  },
};

export const ManyBoxes: Story = {
  args: {
    sources: Array.from({ length: 9 }, (_, slot) => source(`Box ${slot + 1}`, slot, paying(1_000 * (slot + 1)))),
    need: paying(45_000),
    yMax: 50_000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const svg = await plotted(canvasElement);
    // Eight colours, so the eighth and ninth box share "Other" rather than a colour being used twice.
    await expect(canvasElement.querySelectorAll('.flows-layer')).toHaveLength(8);
    await expect(canvas.queryByText('Box 9')).toBeNull();

    const { left, width } = svg.getBoundingClientRect();
    await fireEvent.pointerMove(svg, { clientX: left + width / 2 });
    await waitFor(() => expect(canvasElement.querySelector('.flows-tooltip')).toHaveTextContent(`Other${amount(17_000)}`));
  },
};

export const Hovering: Story = {
  args: pensionsAndFund,
  play: async ({ canvasElement }) => {
    const svg = await plotted(canvasElement);
    await expect(canvasElement.querySelector('.flows-tooltip')).toBeNull();
    const { left, width } = svg.getBoundingClientRect();
    const plotLeft = left + 64;
    const plotWidth = width - 64 - 10;

    // In the middle of 2045, when both pensions pay.
    await fireEvent.pointerMove(svg, { clientX: plotLeft + (plotWidth * 15.5) / YEARS });
    const tooltip = await within(canvasElement).findByRole('status');
    await expect(tooltip).toHaveTextContent('2045');
    await expect(tooltip).toHaveTextContent(`OTP${amount(39_000)}`);
    await expect(tooltip).toHaveTextContent(`National pension${amount(22_000)}`);
    await expect(tooltip).toHaveTextContent(`Need${amount(40_000)}`);
    await expect(tooltip).toHaveTextContent(`Left over${amount(21_000)}`);
    await expect(tooltip).toHaveTextContent('Goes on to Fund');
    await expect(canvasElement.querySelector('.flows-cursor')).not.toBeNull();

    await fireEvent.pointerOut(svg);
    await waitFor(() => expect(canvasElement.querySelector('.flows-tooltip')).toBeNull());
  },
};

export const HoveringWhereMoneyIsMissing: Story = {
  args: { sources: [source('Fund', 0, paying(40_000, 0, 15))], need: paying(40_000), short: paying(40_000, 15) },
  play: async ({ canvasElement }) => {
    const svg = await plotted(canvasElement);
    const { right } = svg.getBoundingClientRect();
    await fireEvent.pointerMove(svg, { clientX: right - 12 });
    const tooltip = await within(canvasElement).findByRole('status');
    await expect(tooltip).toHaveTextContent(`Missing${amount(40_000)}`);
    await expect(tooltip).not.toHaveTextContent('Left over');
    // Near the right edge it stays inside the chart.
    await expect(tooltip.getBoundingClientRect().right).toBeLessThanOrEqual(right + 0.5);
  },
};

export const AsAges: Story = {
  args: { ...pensionsAndFund, birthYear: 1990 },
  play: async ({ canvasElement }) => {
    const svg = await plotted(canvasElement);
    await expect(within(canvasElement).getByText('50 yrs')).toBeVisible();
    await fireEvent.pointerMove(svg, { clientX: svg.getBoundingClientRect().right - 12 });
    await expect(await within(canvasElement).findByRole('status')).toHaveTextContent('70 yrs');
  },
};
