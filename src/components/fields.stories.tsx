import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CheckField, DateField, NumberField, OptionalNumberField, SelectField, TextField } from './fields';

type Args = { onChange: (value: unknown) => void };

const meta: Meta<Args> = {
  title: 'Components/Fields',
  args: { onChange: fn() },
  decorators: [
    (Story) => (
      <div className="box">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<Args>;

function useValue<T>(first: T, { onChange }: Args) {
  const [value, setValue] = useState(first);
  return {
    value,
    onChange: (next: T) => {
      setValue(next);
      onChange(next);
    },
  };
}

export const Text: Story = {
  render: function Render(args) {
    return <TextField label="Name" {...useValue('Fund', args)} />;
  },
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText('Name');
    await userEvent.clear(field);
    await userEvent.type(field, 'Savings');
    await expect(field).toHaveValue('Savings');
    await expect(args.onChange).toHaveBeenLastCalledWith('Savings');
  },
};

export const WholeNumber: Story = {
  render: function Render(args) {
    return <NumberField label="Amount" {...useValue(5000, args)} />;
  },
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText('Amount');
    await userEvent.clear(field);
    // Empty on the way to a new number, while the box already reads it as 0.
    await expect(field).toHaveValue(null);
    await expect(args.onChange).toHaveBeenLastCalledWith(0);
    await userEvent.type(field, '125');
    await expect(args.onChange).toHaveBeenLastCalledWith(125);
    await userEvent.clear(field);
    await userEvent.tab();
    await expect(field).toHaveValue(0);
  },
};

export const OptionalNumber: Story = {
  render: function Render(args) {
    return <OptionalNumberField label="Paid out from age" placeholder="67" {...useValue<number | null>(null, args)} />;
  },
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText('Paid out from age');
    await expect(field).toHaveAttribute('placeholder', '67');
    await userEvent.type(field, '70');
    await expect(args.onChange).toHaveBeenLastCalledWith(70);
    await userEvent.clear(field);
    // Empty means no payout, which is not the same as 0.
    await expect(args.onChange).toHaveBeenLastCalledWith(null);
  },
};

export const Date: Story = {
  render: function Render(args) {
    return <DateField label="Start date" {...useValue('2030-01-15', args)} />;
  },
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText('Start date');
    await expect(field).toHaveValue('2030-01-15');
    await userEvent.clear(field);
    await userEvent.type(field, '2031-06-30');
    await expect(args.onChange).toHaveBeenLastCalledWith('2031-06-30');
  },
};

export const Select: Story = {
  render: function Render(args) {
    return (
      <SelectField
        label="Interval"
        options={[
          { value: 'monthly', label: 'Monthly' },
          { value: 'yearly', label: 'Yearly' },
        ]}
        {...useValue<'monthly' | 'yearly'>('monthly', args)}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText('Interval');
    await userEvent.selectOptions(field, 'Yearly');
    await expect(field).toHaveValue('yearly');
    await expect(args.onChange).toHaveBeenLastCalledWith('yearly');
  },
};

export const Check: Story = {
  render: function Render(args) {
    return <CheckField label="Stops when you stop working" {...useValue(true, args)} />;
  },
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText('Stops when you stop working');
    await expect(field).toBeChecked();
    await userEvent.click(field);
    await expect(field).not.toBeChecked();
    await expect(args.onChange).toHaveBeenLastCalledWith(false);
  },
};
