import { createRef, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Field } from './Field';
import type { JsonCodeEditorHandle } from './JsonCodeEditor';
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
      <JsonInput
        label="Metadata"
        value={text}
        onChange={setText}
        onValidate={setError}
        {...props}
      />
    </Field>
  );
};

/** Waits for the lazy editor and returns its in-shadow content element. */
const editorContent = async (container: HTMLElement): Promise<HTMLElement> =>
  waitFor(() => {
    const content = container
      .querySelector('repo-json-editor')
      ?.shadowRoot?.querySelector<HTMLElement>('.cm-content');
    if (!content) throw new Error('editor not mounted yet');
    return content;
  });

/** Replaces the whole document, as typing would. */
const typeText = (ref: React.RefObject<JsonCodeEditorHandle | null>, text: string) =>
  act(() => {
    const view = ref.current?.view;
    if (!view) throw new Error('no view');
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });

const blur = (content: HTMLElement) =>
  act(() => {
    content.dispatchEvent(new FocusEvent('blur'));
  });

const docOf = (ref: React.RefObject<JsonCodeEditorHandle | null>) =>
  ref.current?.view?.state.doc.toString();

describe('JsonInput', () => {
  it('shows a skeleton, then the CodeMirror editor in the shadow root (AC-15)', async () => {
    const { container } = render(<Harness initial='{"a":1}' />);

    expect(container.querySelector('[data-slot="json-editor-skeleton"]')).not.toBeNull();

    const content = await editorContent(container);
    const shadow = container.querySelector('repo-json-editor')?.shadowRoot;
    expect(shadow?.querySelector('.cm-editor')).not.toBeNull();
    expect(shadow?.querySelector('.cm-lineNumbers')).not.toBeNull();
    expect(content.textContent).toBe('{"a":1}');
    expect(content).toHaveAttribute('aria-label', 'Metadata');
    expect(container.querySelector('[data-slot="json-editor-skeleton"]')).toBeNull();
  });

  it('gives the host the Field id so the label points at it', async () => {
    const { container } = render(<Harness />);
    await editorContent(container);

    const host = container.querySelector('repo-json-editor');
    expect(screen.getByText('Metadata')).toHaveAttribute('for', host?.id);
  });

  it('does not validate while typing before the first blur', async () => {
    const onValidate = vi.fn();
    const ref = createRef<JsonCodeEditorHandle>();
    const { container } = render(<Harness ref={ref} onValidate={onValidate} />);
    await editorContent(container);

    typeText(ref, '{oops');

    expect(onValidate).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error on blur, then validates on every change (AC-17)', async () => {
    const ref = createRef<JsonCodeEditorHandle>();
    const { container } = render(<Harness ref={ref} />);
    const content = await editorContent(container);

    typeText(ref, '{"a": 1,}');
    blur(content);

    const message = 'Invalid JSON: Expected double-quoted property name (line 1, column 9)';
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(content).toHaveAttribute('aria-invalid', 'true');
    const describedBy = content.getAttribute('aria-describedby') ?? '';
    expect(content.getRootNode()).toBeInstanceOf(ShadowRoot);
    expect((content.getRootNode() as ShadowRoot).getElementById(describedBy)).toHaveTextContent(
      message,
    );

    typeText(ref, '{"a": 1}');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(content).not.toHaveAttribute('aria-invalid');
  });

  it('reports parsed values and undefined for invalid or empty text', async () => {
    const onValueChange = vi.fn();
    const ref = createRef<JsonCodeEditorHandle>();
    const { container } = render(<Harness ref={ref} onValueChange={onValueChange} />);
    await editorContent(container);

    typeText(ref, '{"a": [1]}');
    expect(onValueChange).toHaveBeenLastCalledWith({ a: [1] });

    typeText(ref, '{"a": [1]');
    expect(onValueChange).toHaveBeenLastCalledWith(undefined);

    typeText(ref, '');
    expect(onValueChange).toHaveBeenLastCalledWith(undefined);
  });

  it('requires a value when the Field is required', async () => {
    const { container } = render(<Harness required />);
    const content = await editorContent(container);

    blur(content);

    expect(screen.getByRole('alert')).toHaveTextContent('This field is required.');
    expect(content).toHaveAttribute('aria-required', 'true');
  });

  it('checks the expected kind', async () => {
    const { container } = render(<Harness expect="object" initial="[1]" />);

    blur(await editorContent(container));

    expect(screen.getByRole('alert')).toHaveTextContent('Expected a JSON object.');
  });

  it('marks the editor invalid when the Field has an outside error', async () => {
    const { container } = render(
      <Field label="Data" error="Server rejected it">
        <JsonInput label="Data" defaultValue="{}" />
      </Field>,
    );

    expect(await editorContent(container)).toHaveAttribute('aria-invalid', 'true');
  });

  it('formats valid text with 2 spaces and disables Format for invalid or empty text', async () => {
    const ref = createRef<JsonCodeEditorHandle>();
    const { container } = render(<Harness ref={ref} initial='{"a":1}' />);
    await editorContent(container);
    const format = screen.getByRole('button', { name: 'Format JSON' });

    await userEvent.click(format);
    expect(docOf(ref)).toBe('{\n  "a": 1\n}');

    typeText(ref, '{"a":');
    expect(format).toBeDisabled();

    typeText(ref, '');
    expect(format).toBeDisabled();
  });

  it('works uncontrolled from defaultValue', async () => {
    const onChange = vi.fn();
    const ref = createRef<JsonCodeEditorHandle>();
    const { container } = render(
      <JsonInput ref={ref} label="Data" defaultValue="[1,2]" onChange={onChange} />,
    );
    await editorContent(container);

    await userEvent.click(screen.getByRole('button', { name: 'Format JSON' }));

    expect(docOf(ref)).toBe('[\n  1,\n  2\n]');
    expect(onChange).toHaveBeenCalledWith('[\n  1,\n  2\n]');
  });

  it('blocks edits and disables Format while disabled', async () => {
    const ref = createRef<JsonCodeEditorHandle>();
    const { container } = render(<Harness ref={ref} initial="{}" disabled />);
    const content = await editorContent(container);

    expect(content).toHaveAttribute('contenteditable', 'false');
    expect(content).toHaveAttribute('aria-disabled', 'true');
    expect(ref.current?.view?.state.readOnly).toBe(true);
    expect(screen.getByRole('button', { name: 'Format JSON' })).toBeDisabled();
  });

  it('disables Format while read-only', async () => {
    const { container } = render(<Harness initial="{}" readOnly />);

    expect(await editorContent(container)).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByRole('button', { name: 'Format JSON' })).toBeDisabled();
  });

  it('forwards the ref to the editor handle and calls onBlur', async () => {
    const ref = createRef<JsonCodeEditorHandle>();
    const onBlur = vi.fn();
    const { container } = render(<JsonInput ref={ref} label="Data" name="data" onBlur={onBlur} />);
    const content = await editorContent(container);

    act(() => ref.current?.focus());
    expect(content.getRootNode() as ShadowRoot).toHaveProperty('activeElement', content);

    blur(content);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(container.querySelector('repo-json-editor')).toHaveAttribute('name', 'data');
  });
});
