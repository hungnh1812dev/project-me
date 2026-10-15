import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';

import { Field } from '../../components/native/Field';
import { Select } from '../../components/ui/select';
import { Controlled, useArgsValue } from '../Controlled';
import { SelectSection } from '../sections/SelectSection';

const meta = {
  title: 'Components/Select',
  component: Select,
  args: {
    value: null,
    onChange: fn(),
    onBlur: fn(),
    config: {
      placeholder: 'Choose an expiry',
      options: [
        { value: '1h', label: '1 hour' },
        { value: '1d', label: '1 day' },
        { value: '1y', label: '1 year' },
      ],
    },
    disabled: false,
    readOnly: false,
  },
  argTypes: {
    value: { control: 'text' },
    config: { control: 'object' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "Expires in" (1 hour, 1 day, 1 year) and "Disabled select" (AC-9). */
export const Default: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <SelectSection />,
};

/**
 * One Select on the contract (AC-14): `value`, `config` (`placeholder`, `options`), `disabled` and
 * `readOnly` are Controls, picking an option updates the `value` arg, and the "Value:" readout
 * shows it as JSON.
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const bind = useArgsValue(value, onChange);
    return (
      <Controlled {...bind}>
        {(field) => (
          <Field label="Expires in">
            <Select {...args} {...field} />
          </Field>
        )}
      </Controlled>
    );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const readout = canvas.getByRole('status', { name: 'Value' });
    await expect(readout).toHaveTextContent('null');

    await userEvent.click(canvas.getByRole('combobox', { name: 'Expires in' }));
    // The popup is portalled to the body, outside the canvas.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('option', { name: '1 day' }));

    // updateArgs re-renders the story asynchronously, so the readout is polled.
    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('"1d"'),
    );
  },
};
