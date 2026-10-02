import { createRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Field } from './Field';
import { JsonInput, type JsonInputProps } from './JsonInput';

/** A Field wired to JsonInput the way pages use it. */
const Harness: React.FC<Partial<JsonInputProps> & { initial?: string }> = ({
  initial = '',
  required,
  ...props
}) => {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <Field label="Metadata" error={error} required={required}>
      <JsonInput value={text} onChange={setText} onValidate={setError} {...props} />
    </Field>
  );
};

const typeText = (target: HTMLElement, text: string) =>
  fireEvent.change(target, { target: { value: text } });

describe('JsonInput', () => {
  it('renders a monospace textarea without spellcheck or autocorrect', () => {
    render(<Harness />);

    const textarea = screen.getByRole('textbox', { name: 'Metadata' });
    expect(textarea).toHaveClass('font-mono');
    expect(textarea).toHaveAttribute('spellcheck', 'false');
    expect(textarea).toHaveAttribute('autocapitalize', 'off');
    expect(textarea).toHaveAttribute('autocomplete', 'off');
  });

  it('does not validate while typing before the first blur', () => {
    const onValidate = vi.fn();
    render(<Harness onValidate={onValidate} />);

    typeText(screen.getByRole('textbox', { name: 'Metadata' }), '{oops');

    expect(onValidate).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error on blur, then validates on every change', async () => {
    render(<Harness />);
    const textarea = screen.getByRole('textbox', { name: 'Metadata' });

    typeText(textarea, '{"a": 1,}');
    fireEvent.blur(textarea);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid JSON: Expected double-quoted property name (line 1, column 9)',
    );
    expect(textarea).toHaveAttribute('aria-invalid', 'true');

    typeText(textarea, '{"a": 1}');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute('aria-invalid');
  });

  it('reports parsed values and undefined for invalid or empty text', () => {
    const onValueChange = vi.fn();
    render(<Harness onValueChange={onValueChange} />);
    const textarea = screen.getByRole('textbox', { name: 'Metadata' });

    typeText(textarea, '{"a": [1]}');
    expect(onValueChange).toHaveBeenLastCalledWith({ a: [1] });

    typeText(textarea, '{"a": [1]');
    expect(onValueChange).toHaveBeenLastCalledWith(undefined);

    typeText(textarea, '');
    expect(onValueChange).toHaveBeenLastCalledWith(undefined);
  });

  it('requires a value when the Field is required', () => {
    render(<Harness required />);
    const textarea = screen.getByRole('textbox', { name: 'Metadata' });

    fireEvent.blur(textarea);

    expect(screen.getByRole('alert')).toHaveTextContent('This field is required.');
    expect(textarea).toBeRequired();
  });

  it('checks the expected kind', () => {
    render(<Harness expect="object" initial="[1]" />);

    fireEvent.blur(screen.getByRole('textbox', { name: 'Metadata' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Expected a JSON object.');
  });

  it('formats valid text with 2 spaces and disables Format for invalid or empty text', async () => {
    render(<Harness initial='{"a":1}' />);
    const textarea = screen.getByRole('textbox', { name: 'Metadata' });
    const format = screen.getByRole('button', { name: 'Format JSON' });

    await userEvent.click(format);
    expect(textarea).toHaveValue('{\n  "a": 1\n}');

    typeText(textarea, '{"a":');
    expect(format).toBeDisabled();

    typeText(textarea, '');
    expect(format).toBeDisabled();
  });

  it('works uncontrolled from defaultValue', async () => {
    const onChange = vi.fn();
    render(<JsonInput aria-label="Data" defaultValue="[1,2]" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Format JSON' }));

    expect(screen.getByRole('textbox', { name: 'Data' })).toHaveValue('[\n  1,\n  2\n]');
    expect(onChange).toHaveBeenCalledWith('[\n  1,\n  2\n]');
  });

  it('keeps Tab moving focus (no keyboard trap)', async () => {
    render(<Harness initial="{}" />);

    await userEvent.click(screen.getByRole('textbox', { name: 'Metadata' }));
    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'Format JSON' })).toHaveFocus();
  });

  it('ignores input and disables Format while disabled', async () => {
    render(<Harness initial="{}" disabled />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Metadata' }), 'x');

    expect(screen.getByRole('textbox', { name: 'Metadata' })).toHaveValue('{}');
    expect(screen.getByRole('textbox', { name: 'Metadata' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Format JSON' })).toBeDisabled();
  });

  it('forwards ref to the textarea and calls a native onBlur', () => {
    const ref = createRef<HTMLTextAreaElement>();
    const onBlur = vi.fn();
    render(<JsonInput ref={ref} aria-label="Data" onBlur={onBlur} />);

    fireEvent.blur(screen.getByRole('textbox', { name: 'Data' }));

    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Data' }));
    expect(onBlur).toHaveBeenCalled();
  });
});
