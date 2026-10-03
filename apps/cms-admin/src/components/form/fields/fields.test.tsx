import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { JsonInput } from '@/components/form/JsonInput';
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

describe('JsonField (AC-7, AC-8)', () => {
  it('shows the value as two-space JSON text and saves it parsed', async () => {
    const { onSubmit, user } = renderForm();

    const meta = screen.getByLabelText('Meta');
    expect(meta).toHaveValue('{\n  "a": 1\n}');
    expect(meta.closest('[data-slot="field"]')).toHaveClass('md:col-span-6');

    fireEvent.change(meta, { target: { value: '[1, 2]' } });
    await save(user);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ meta: [1, 2] })),
    );
  });

  it('keeps invalid text, shows the parse error, focuses the field and sends nothing', async () => {
    const { onSubmit, user } = renderForm();

    const meta = screen.getByLabelText('Meta');
    fireEvent.change(meta, { target: { value: '{"a":' } });
    await save(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^Invalid JSON: /);
    expect(meta).toHaveValue('{"a":');
    expect(meta).toHaveAttribute('aria-invalid', 'true');
    expect(meta).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(meta, { target: { value: '{"a": 2}' } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('is read-only, with Format JSON disabled, in read-only mode', () => {
    renderForm({ meta: '{"a":1}' }, true);

    expect(screen.getByLabelText('Meta')).toHaveAttribute('readonly');
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
    render(<JsonInput aria-label="Data" value='{"a":1}' readOnly />);

    expect(screen.getByRole('button', { name: 'Format JSON' })).toBeDisabled();
  });
});
