import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';

import { Field } from '../../components/forms/Field';
import { Checkbox } from '../../components/ui/checkbox';
import { Controlled, useArgsValue } from '../Controlled';
import { CheckboxSection } from '../sections/CheckboxSection';

const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
  args: {
    value: false,
    onChange: fn(),
    config: { indeterminate: false },
    disabled: false,
    readOnly: false,
  },
  argTypes: {
    value: { control: 'boolean' },
    config: { control: 'object' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Subscribe, Checked, Some selected (mixed) and Disabled checkbox (AC-9). */
export const Default: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <CheckboxSection />,
};

/**
 * One Checkbox on the contract (AC-14): `value`, `config` (`indeterminate`), `disabled` and
 * `readOnly` are Controls, toggling it updates the `value` arg, and the "Value:" readout shows it.
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const bind = useArgsValue(value, onChange);
    return (
      <Controlled {...bind}>
        {(field) => (
          <Field label="Subscribe">
            <Checkbox {...args} {...field} />
          </Field>
        )}
      </Controlled>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const readout = canvas.getByRole('status', { name: 'Value' });
    await expect(readout).toHaveTextContent('false');

    await userEvent.click(canvas.getByRole('checkbox', { name: 'Subscribe' }));

    // updateArgs re-renders the story asynchronously, so the readout is polled.
    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('true'),
    );
  },
};
