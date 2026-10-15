import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';

import { Field } from '../../components/native/Field';
import { PasswordInput } from '../../components/native/PasswordInput';
import { Input } from '../../components/ui/input';
import { Controlled, useArgsValue } from '../Controlled';
import { InputSection } from '../sections/InputSection';

const meta = {
  title: 'Components/Input',
  component: Input,
  args: {
    value: '',
    onChange: fn(),
    onBlur: fn(),
    config: { type: 'text', placeholder: 'Jane Doe' },
    disabled: false,
    readOnly: false,
  },
  argTypes: {
    value: { control: 'text' },
    config: { control: 'object' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    leading: { control: false },
    trailing: { control: false },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Seven labelled inputs: placeholder, filled, disabled, error, required, search and password (AC-9). */
export const Default: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <InputSection />,
};

/**
 * One Input on the contract (AC-14): `value`, `config`, `disabled` and `readOnly` are Controls,
 * typing updates the `value` arg, and the "Value:" readout shows it as JSON.
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const bind = useArgsValue(value, onChange);
    return (
      <Controlled {...bind}>
        {(field) => (
          <Field label="Name">
            <Input {...args} {...field} />
          </Field>
        )}
      </Controlled>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const readout = canvas.getByRole('status', { name: 'Value' });
    await expect(readout).toHaveTextContent('""');

    await userEvent.type(canvas.getByRole('textbox', { name: 'Name' }), 'Jane');

    // updateArgs re-renders the story asynchronously, so the readout is polled.
    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('"Jane"'),
    );
  },
};

/**
 * One PasswordInput on the contract (AC-14): the same Controls (its `config` takes `placeholder`
 * and `autoComplete`), typing updates the `value` arg and the readout, and the toggle shows it.
 */
export const PasswordPlayground: Story = {
  args: { config: { autoComplete: 'new-password' } },
  render: function Render({
    value,
    onChange,
    config,
    leading: _leading,
    trailing: _trailing,
    ...args
  }) {
    const bind = useArgsValue(value, onChange);
    return (
      <Controlled {...bind}>
        {(field) => (
          <Field label="Password">
            <PasswordInput
              {...args}
              {...field}
              config={{ placeholder: config?.placeholder, autoComplete: config?.autoComplete }}
            />
          </Field>
        )}
      </Controlled>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const readout = canvas.getByRole('status', { name: 'Value' });
    await expect(readout).toHaveTextContent('""');

    await userEvent.type(canvas.getByLabelText('Password'), 's3cret');

    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('"s3cret"'),
    );
  },
};
