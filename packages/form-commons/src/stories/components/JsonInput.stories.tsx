import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';

import { Field } from '../../components/native/Field';
import { JsonInput, type JsonInputProps } from '../../components/native/JsonInput';
import { editorViewOf } from '../../lib/jsonEditorView';
import { Controlled, useArgsValue } from '../Controlled';
import { JsonInputSection } from '../sections/JsonInputSection';

const meta = {
  title: 'Components/JsonInput',
  component: JsonInput,
  args: {
    value: '',
    onChange: fn(),
    onBlur: fn(),
    onValidate: fn(),
    onValueChange: fn(),
    config: { label: 'Settings', expect: 'object', rows: 6, description: 'A JSON object.' },
    disabled: false,
    readOnly: false,
  },
  argTypes: {
    value: { control: 'text' },
    config: { control: 'object' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
} satisfies Meta<typeof JsonInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Six JSON editors, including the controlled Metadata object demo (AC-9). */
export const Default: Story = {
  parameters: { controls: { disable: true }, actions: { disable: true } },
  render: () => <JsonInputSection />,
};

/**
 * The Playground's Field: the parse message from `onValidate` shows under the editor, as pages
 * wire it. Its state lives here, not in the story's `render`, which may only run Storybook hooks.
 */
const JsonPlaygroundField: React.FC<JsonInputProps> = ({ onValidate, ...props }) => {
  const [error, setError] = useState<string | null>(null);
  return (
    <Field
      label={props.config?.label ?? 'Settings'}
      description={props.config?.description}
      error={error}
    >
      <JsonInput
        {...props}
        onValidate={(message) => {
          onValidate?.(message);
          setError(message);
        }}
      />
    </Field>
  );
};
JsonPlaygroundField.displayName = 'JsonPlaygroundField';

/**
 * One JsonInput on the contract (AC-14): `value`, `config`, `disabled` and `readOnly` are Controls,
 * typing updates the `value` arg, the "Value:" readout shows the text as JSON, and the parse
 * message from `onValidate` shows under the editor after the first blur.
 */
export const Playground: Story = {
  render: function Render({ value, onChange, ...args }) {
    const bind = useArgsValue(value, onChange);
    return (
      <Controlled {...bind}>{(field) => <JsonPlaygroundField {...args} {...field} />}</Controlled>
    );
  },
  play: async ({ canvas, canvasElement }) => {
    const readout = canvas.getByRole('status', { name: 'Value' });
    await expect(readout).toHaveTextContent('""');

    // The editor loads lazily into a shadow root. Synthetic key events don't reach CodeMirror (it
    // reads `beforeinput` and DOM changes), so the play types through the view, as a user edit.
    const view = await waitFor(() => {
      const host = canvasElement.querySelector('repo-json-editor');
      const found = host && editorViewOf(host);
      if (!found) throw new Error('editor not mounted yet');
      return found;
    });
    view.focus();
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '[1]' },
      selection: { anchor: 3 },
      userEvent: 'input.type',
    });

    await waitFor(() =>
      expect(canvas.getByRole('status', { name: 'Value' })).toHaveTextContent('"[1]"'),
    );
  },
};
