import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import Tabs, { TabPanel } from './Tabs';

function TwoTabs() {
  const [active, setActive] = useState<'simulation' | 'input'>('simulation');
  return (
    <>
      <Tabs
        label="Sections"
        tabs={[
          { id: 'simulation', label: 'Simulation' },
          { id: 'input', label: 'Input' },
        ]}
        active={active}
        onChange={setActive}
      />
      <TabPanel id="simulation" active={active === 'simulation'}>
        <p>The passes</p>
      </TabPanel>
      <TabPanel id="input" active={active === 'input'}>
        <p>The boxes</p>
      </TabPanel>
    </>
  );
}

const meta: Meta<typeof TwoTabs> = { title: 'Components/Tabs', component: TwoTabs };
export default meta;

type Story = StoryObj<typeof TwoTabs>;

export const Clicking: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(canvas.getByRole('tab', { name: 'Input' }));
    await expect(canvas.getByRole('tab', { name: 'Input' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toHaveAttribute('aria-selected', 'false');
  },
};

export const ArrowKeys: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('tab', { name: 'Simulation' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('tab', { name: 'Input' })).toHaveFocus();
    // Past the last tab it starts over.
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(canvas.getByRole('tab', { name: 'Input' })).toHaveAttribute('aria-selected', 'true');
  },
};

// A panel is named by its tab, and only the chosen one shows.
export const EachTabHasItsPanel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const simulation = canvas.getByRole('tabpanel', { name: 'Simulation' });
    await expect(simulation).toHaveTextContent('The passes');
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toHaveAttribute('aria-controls', simulation.id);
    await expect(canvas.queryByRole('tabpanel', { name: 'Input' })).toBeNull();

    await userEvent.click(canvas.getByRole('tab', { name: 'Input' }));
    const input = canvas.getByRole('tabpanel', { name: 'Input' });
    await expect(input).toHaveTextContent('The boxes');
    await expect(canvas.getByRole('tab', { name: 'Input' })).toHaveAttribute('aria-controls', input.id);
    await expect(canvas.queryByRole('tabpanel', { name: 'Simulation' })).toBeNull();
  },
};
