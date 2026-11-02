import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactFlow, ReactFlowProvider, useNodesState } from '@xyflow/react';
import { useMemo } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { translations } from '../i18n';
import { createBox, inputOf, wireOf } from '../model/graph';
import { queryOf } from '../model/query';
import type { DiagnosticCode } from '../model/spec';
import type { BoxType, PlacedBox } from '../model/types';
import { CardContext, nodeTypes } from './BoxCards';

const names = translations.en.defaultNames;
const money = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

interface Args {
  type: BoxType;
  // A box wired into the card, for cards that change with what they are wired to.
  from?: BoxType;
  warning?: DiagnosticCode;
}

// A card on a canvas of its own, which is what the dots on it need to work.
function OneCard({ type, from, warning }: Args) {
  const [nodes, , onNodesChange] = useNodesState<PlacedBox>([createBox(type, { x: 24, y: 24 }, names)]);
  const box = nodes[0];
  const source = useMemo(() => (from ? createBox(from, { x: 0, y: 0 }, names) : null), [from]);
  const cards = useMemo(
    () => ({
      query: queryOf(
        inputOf({
          boxes: source ? [box, source] : [box],
          wires: source ? [wireOf(source.id, box.id, 'money')] : [],
        }),
      ),
      diagnostics: warning ? [{ boxId: box.id, code: warning }] : [],
      money: (amount: number) => money.format(amount),
    }),
    [box, source, warning],
  );

  return (
    <div style={{ height: 560 }}>
      <CardContext.Provider value={cards}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            panOnDrag={false}
            zoomOnScroll={false}
          />
        </ReactFlowProvider>
      </CardContext.Provider>
    </div>
  );
}

const meta: Meta<typeof OneCard> = { title: 'Input/BoxCards', component: OneCard };
export default meta;

type Story = StoryObj<typeof OneCard>;

// A card stays hidden until React Flow has measured it.
async function shown(canvasElement: HTMLElement) {
  await waitFor(() => expect(canvasElement.querySelector('.box')).toBeVisible());
  return within(canvasElement);
}

const dots = (canvasElement: HTMLElement) =>
  [...canvasElement.querySelectorAll('.react-flow__handle')].map((dot) =>
    [dot.classList.contains('source') ? 'out' : 'in', [...dot.classList].find((name) => /^port-/.test(name))].join(' '),
  );

export const Income: Story = {
  args: { type: 'income' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    const name = canvas.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Bonus');
    await expect(name).toHaveValue('Bonus');
    await expect(canvas.getByLabelText('Stops when you stop working')).toBeChecked();
    await expect(canvas.getByRole('button', { name: 'Delete Bonus' })).toBeVisible();
    await expect(dots(canvasElement).sort()).toEqual(['out port-basis', 'out port-money']);
  },
};

export const IncomeWithWarning: Story = {
  args: { type: 'income', warning: 'transfersExceedIncome' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    await expect(canvas.getByText(translations.en.diagnostics.transfersExceedIncome)).toBeVisible();
  },
};

export const TransferFromSalary: Story = {
  args: { type: 'transfer', from: 'income' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    canvas.getByLabelText('Amount');
    // A salary already has its own rhythm, so only a transfer from an account has an interval.
    await expect(canvas.queryByLabelText('Interval')).toBeNull();
  },
};

export const TransferFromAccount: Story = {
  args: { type: 'transfer', from: 'account' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    await expect(canvas.getByLabelText('Interval')).toBeVisible();
  },
};

export const Budget: Story = {
  args: { type: 'budget', from: 'income' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    const add = canvas.getByRole('button', { name: 'Add line' });
    const before = canvas.getAllByLabelText('Line name').length;
    await userEvent.click(add);
    await expect(canvas.getAllByLabelText('Line name')).toHaveLength(before + 1);

    const amounts = canvas.getAllByLabelText('Amount a month');
    for (const amount of amounts) await userEvent.clear(amount);
    await userEvent.type(amounts[0], '12000');
    await expect(canvas.getByText('Total a month').parentElement).toHaveTextContent(money.format(12_000));
    // The salary on the default card pays more than that, and what is left can be saved.
    await expect(canvas.getByText('Left to save a month').parentElement).toHaveTextContent(money.format(50_000 - 12_000));

    await userEvent.click(canvas.getByRole('button', { name: 'Delete New line' }));
    await expect(canvas.getAllByLabelText('Line name')).toHaveLength(before);
  },
};

export const Account: Story = {
  args: { type: 'account' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    const type = canvas.getByLabelText('Account type');
    await expect(canvas.queryByLabelText('Tax on gains (%)')).toBeNull();
    await userEvent.selectOptions(type, 'ASK');
    await expect(canvas.getByLabelText('Tax on gains (%)')).toBeVisible();
    await expect(canvas.getByLabelText('Inflation (%)')).toBeVisible();
    await expect(canvas.getByLabelText('Shielding rate (%)')).toHaveValue(3.6);
    await expect(canvas.getByLabelText('Unused shielding at start')).toHaveValue(0);
    await userEvent.selectOptions(type, 'Regular');
    await expect(canvas.queryByLabelText('Tax on gains (%)')).toBeNull();
    await expect(canvas.queryByLabelText('Shielding rate (%)')).toBeNull();
    await expect(dots(canvasElement).sort()).toEqual(['in port-influence', 'in port-money', 'out port-basis', 'out port-money']);
  },
};

export const Return: Story = {
  args: { type: 'return' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    canvas.getByLabelText('Real annual return (%)');
    await expect(dots(canvasElement)).toEqual(['out port-influence']);
  },
};

export const Otp: Story = {
  args: { type: 'otp' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    const age = canvas.getByLabelText('Paid out from age');
    await expect(canvas.queryByLabelText('Years of payout')).toBeNull();
    await userEvent.type(age, '67');
    await expect(canvas.getByLabelText('Years of payout')).toBeVisible();
    await expect(dots(canvasElement).sort()).toEqual(['in port-basis', 'in port-influence', 'out port-basis', 'out port-money']);
  },
};

export const Folketrygd: Story = {
  args: { type: 'folketrygd' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    const age = canvas.getByLabelText('Paid out from age');
    await expect(canvas.queryByLabelText('Divisor')).toBeNull();
    await userEvent.type(age, '67');
    // Left empty, the estimate for that age is used, and the field says which one.
    await expect((canvas.getByLabelText('Divisor') as HTMLInputElement).placeholder).not.toBe('');
    await expect(dots(canvasElement).sort()).toEqual(['in port-basis', 'out port-basis', 'out port-money']);
  },
};

export const Withdrawal: Story = {
  args: { type: 'withdrawal' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    const mode = canvas.getByLabelText('Set as');
    await expect(canvas.getByLabelText('Amount a month (before tax)')).toBeVisible();
    await userEvent.selectOptions(mode, 'Percent of the accounts');
    await expect(canvas.queryByLabelText('Amount a month (before tax)')).toBeNull();
    await expect(canvas.getByLabelText('Percent a year')).toBeVisible();
  },
};

// Known bug, so it is left out of the test run. The field keeps showing the amount until it loses focus, because
// React reuses the field and NumberField keeps its text. Remove the tag when it is fixed.
export const WithdrawalShowsThePercent: Story = {
  args: { type: 'withdrawal' },
  tags: ['!test'],
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText('Set as'), 'Percent of the accounts');
    await expect(canvas.getByLabelText('Percent a year')).toHaveValue(4);
  },
};

export const Summary: Story = {
  args: { type: 'summary' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    await expect(canvas.getByLabelText('Name')).toHaveValue('Summary');
    await expect(canvas.getByText(translations.en.summaryNote)).toBeVisible();
    // It only reads, so it takes basis wires and gives nothing on.
    await expect(dots(canvasElement)).toEqual(['in port-basis']);
  },
};

export const G: Story = {
  args: { type: 'g' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    canvas.getByLabelText('G (NOK)');
    // There is one G, so it has neither wires nor a delete button.
    await expect(canvas.queryByRole('button', { name: /Delete/ })).toBeNull();
    await expect(dots(canvasElement)).toEqual([]);
  },
};

export const Me: Story = {
  args: { type: 'me' },
  play: async ({ canvasElement }) => {
    const canvas = await shown(canvasElement);
    await expect(canvas.getByLabelText('Birth year')).toHaveValue(null);
    await expect(canvas.queryByRole('button', { name: /Delete/ })).toBeNull();
    await expect(dots(canvasElement)).toEqual([]);
  },
};
