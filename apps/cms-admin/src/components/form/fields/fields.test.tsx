import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { JsonInput } from '@repo/ui/form/JsonInput';
import { editorViewOf } from '@repo/ui/lib/jsonEditorView';

import type { DocumentData, FieldDefinition, FieldType } from '@/features/content/types';

import { SchemaForm } from '../SchemaForm';

const FIELDS: FieldDefinition[] = [
  { name: 'featured', type: 'boolean', width: '1/3' },
  { name: 'meta', type: 'json' },
  { name: 'location', type: 'geo' as FieldType, width: '50%' },
];

function renderForm(
  document: DocumentData | null = { featured: true, meta: { a: 1 }, location: { lat: 1 } },
  readOnly = false,
) {
  const onSubmit = vi.fn(async (data: DocumentData) => data);
  render(
    <>
      <SchemaForm
        id="doc-form"
        fields={FIELDS}
        document={document}
        onSubmit={onSubmit}
        readOnly={readOnly}
      />
      <button type="submit" form="doc-form">
        Save
      </button>
    </>,
  );
  return { onSubmit, user: userEvent.setup() };
}

const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Save' }));

describe('BooleanField (AC-7)', () => {
  it('renders a labelled switch with its width span and toggles the value', async () => {
    const { onSubmit, user } = renderForm();

    const toggle = screen.getByRole('switch', { name: 'Featured' });
    expect(toggle).toBeChecked();
    expect(toggle.closest('[data-slot="field"]')).toHaveClass('md:col-span-2');

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    await save(user);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ featured: false })),
    );
  });

  it('treats a missing value as false', () => {
    renderForm(null);

    expect(screen.getByRole('switch', { name: 'Featured' })).not.toBeChecked();
  });

  it('cannot be toggled in read-only mode', async () => {
    const { user } = renderForm(undefined, true);

    const toggle = screen.getByRole('switch', { name: 'Featured' });
    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(toggle).toHaveAttribute('aria-readonly', 'true');
  });
});

/** Waits for the lazy JSON editor of a field and returns its in-shadow content and view. */
async function jsonEditor(label: string) {
  const content = await waitFor(() => {
    const node = screen
      .getByText(label, { selector: 'label' })
      .closest('[data-slot="field"]')
      ?.querySelector('repo-json-editor')
      ?.shadowRoot?.querySelector<HTMLElement>('.cm-content');
    if (!node) throw new Error('editor not mounted yet');
    return node;
  });
  const view = editorViewOf((content.getRootNode() as ShadowRoot).host);
  if (!view) throw new Error('no EditorView');
  const replace = (text: string) =>
    act(() => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    });
  return { content, view, replace };
}

describe('JsonField (AC-7, AC-8, AC-17, AC-20)', () => {
  it('shows the value as two-space JSON text and saves it parsed', async () => {
    const { onSubmit, user } = renderForm();

    const { content, view, replace } = await jsonEditor('Meta');
    expect(view.state.doc.toString()).toBe('{\n  "a": 1\n}');
    expect(content.getRootNode()).toBeInstanceOf(ShadowRoot);
    const host = (content.getRootNode() as ShadowRoot).host;
    expect(host.closest('[data-slot="field"]')).toHaveClass('md:col-span-6');
    expect(host).toHaveAttribute('name', 'meta');

    replace('[1, 2]');
    await save(user);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ meta: [1, 2] })),
    );
  });

  it('names the editor from the field label (AC-20)', async () => {
    renderForm();

    const { content } = await jsonEditor('Meta');
    expect(content).toHaveAttribute('aria-label', 'Meta');
  });

  it('keeps invalid text, shows the parse error, focuses the field and sends nothing', async () => {
    const { onSubmit, user } = renderForm();

    const { content, view, replace } = await jsonEditor('Meta');
    replace('{"a":');
    await save(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^Invalid JSON: /);
    expect(view.state.doc.toString()).toBe('{"a":');
    expect(content).toHaveAttribute('aria-invalid', 'true');
    expect(content.getRootNode()).toHaveProperty('activeElement', content);
    expect(onSubmit).not.toHaveBeenCalled();

    replace('{"a": 2}');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('is read-only, with Format JSON disabled, in read-only mode', async () => {
    renderForm({ meta: '{"a":1}' }, true);

    const { content, view } = await jsonEditor('Meta');
    expect(content).toHaveAttribute('aria-readonly', 'true');
    expect(view.state.readOnly).toBe(true);
    expect(screen.getByRole('button', { name: 'Format JSON' })).toBeDisabled();
  });
});

describe('UnsupportedField (AC-7)', () => {
  it('shows a read-only JSON preview labelled with the type, with its width span', () => {
    renderForm();

    const preview = screen.getByLabelText('Location');
    expect(preview).toHaveAttribute('readonly');
    expect(preview).toHaveValue('{\n  "lat": 1\n}');
    expect(preview).toHaveAccessibleDescription('Unsupported field type "geo"');
    expect(preview.closest('[data-slot="field"]')).toHaveClass('md:col-span-3');
  });

  it('sends the value back unchanged', async () => {
    const { onSubmit, user } = renderForm();

    await save(user);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        featured: true,
        meta: { a: 1 },
        location: { lat: 1 },
      }),
    );
  });

  it('shows an empty preview for a missing value', () => {
    renderForm(null);

    expect(screen.getByLabelText('Location')).toHaveValue('');
  });
});

describe('JsonInput read-only', () => {
  it('disables Format JSON when read-only', () => {
    render(<JsonInput label="Data" value='{"a":1}' readOnly />);

    expect(screen.getByRole('button', { name: 'Format JSON' })).toBeDisabled();
  });
});
