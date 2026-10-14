import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';

import { Field } from '../../components/forms/Field';
import { Textarea } from '../../components/ui/textarea';
import { Controlled, useArgsValue } from '../Controlled';
import { TextareaSection } from '../sections/TextareaSection';

const meta = {
  title: 'Components/Textarea',
  component: Textarea,
  args: {
    value: '',
    onChange: fn(),
    onBlur: fn(),
    config: { rows: 4, maxLength: 120, placeholder: 'A few words about you' },
    disabled: false,
    readOnly: false,
  },
  argTypes: {
    value: { control: 'text' },
    config: { control: 'object' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five labelled textareas, including the Bio character counter (AC-9). */
export const AllStates: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <TextareaSection />,
};

/**
 * One Textarea on the contract (AC-14): `value`, `config`, `disabled` and `readOnly` are Controls,
 * typing updates the `value` arg, the counter follows it, and the "Value:" readout shows it as JSON.
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const bind = useArgsValue(value, onChange);
    return (
      <Controlled {...bind}>
        {(field) => (
          <Field label="Bio">
            <Textarea {...args} {...field} />
          </Field>
        )}
      </Controlled>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const readout = canvas.getByRole('status', { name: 'Value' });
    await expect(readout).toHaveTextContent('""');

    await userEvent.type(canvas.getByRole('textbox', { name: 'Bio' }), 'Hello');

    // updateArgs re-renders the story asynchronously, so the readout is polled.
    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('"Hello"'),
    );
    await expect(canvas.getByText('5 / 120')).toBeInTheDocument();
  },
};
