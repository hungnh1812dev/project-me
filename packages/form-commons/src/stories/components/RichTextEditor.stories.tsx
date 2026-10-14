import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';

import { Controlled, useArgsValue } from '../Controlled';
import { RichTextDemo, RichTextEditorSection } from '../sections/RichTextEditorSection';

const meta = {
  title: 'Components/RichTextEditor',
  component: RichTextDemo,
  args: {
    label: 'Body',
    value: '<p>Hello world</p>',
    onChange: fn(),
    onBlur: fn(),
    onRoundTripLoss: fn(),
    readOnly: false,
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    readOnly: { control: 'boolean' },
  },
} satisfies Meta<typeof RichTextDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Four editors: empty, every format, read-only, and lost markup with the round-trip warning. */
export const Default: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <RichTextEditorSection />,
};

/**
 * One editor holding HTML: `value`, `label` and `readOnly` are Controls, edits update the `value`
 * arg, and the "Value:" readout shows the HTML as JSON.
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const bind = useArgsValue(value, onChange);
    return <Controlled {...bind}>{(field) => <RichTextDemo {...args} {...field} />}</Controlled>;
  },
  play: async ({ canvas, userEvent }) => {
    // The editor loads lazily (a cold dev server compiles the chunk first), so wait for its textbox.
    const editor = await canvas.findByRole('textbox', { name: 'Body' }, { timeout: 10_000 });
    await userEvent.click(editor);
    await userEvent.click(canvas.getByRole('button', { name: 'Heading 2' }));

    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent(
        '"<h2>Hello world</h2>"',
      ),
    );
    await expect(canvas.getByRole('button', { name: 'Heading 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};
