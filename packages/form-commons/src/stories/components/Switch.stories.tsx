import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';

import { Field } from '../../components/forms/Field';
import { Switch } from '../../components/ui/switch';
import { Controlled, useArgsValue } from '../Controlled';
import { SwitchSection } from '../sections/SwitchSection';

const meta = {
  title: 'Components/Switch',
  component: Switch,
  args: { value: false, onChange: fn(), config: {}, disabled: false, readOnly: false },
  argTypes: {
    value: { control: 'boolean' },
    config: { control: 'object' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five labelled switches: off, on, disabled, error and required (AC-9). */
export const AllStates: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <SwitchSection />,
};

/**
 * One Switch on the contract (AC-14): `value`, `config`, `disabled` and `readOnly` are Controls,
 * toggling it updates the `value` arg, and the "Value:" readout shows it as JSON.
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const bind = useArgsValue(value, onChange);
    return (
      <Controlled value={bind.value}>
        <Field label="Notifications">
          <Switch {...args} {...bind} />
        </Field>
      </Controlled>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const readout = canvas.getByRole('status', { name: 'Value' });
    await expect(readout).toHaveTextContent('false');

    await userEvent.click(canvas.getByRole('switch', { name: 'Notifications' }));

    // updateArgs re-renders the story asynchronously, so the readout is polled.
    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('true'),
    );
  },
};
