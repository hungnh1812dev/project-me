import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import type { DocumentData, FieldDefinition, FieldType } from '@/features/content/types';

import { SchemaForm, type SchemaFormProps } from './SchemaForm';

const FIELDS: FieldDefinition[] = [
  { name: 'title', type: 'text', width: '50%' },
  { name: 'pageViews', type: 'number', width: '1/3' },
  { name: 'subtitle', type: 'text', width: '25%' },
];

function renderForm(props: Partial<SchemaFormProps> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn(async (data: DocumentData) => data);
  const onDirtyChange = vi.fn();
  render(
    <>
      <SchemaForm
        id="doc-form"
        fields={FIELDS}
        document={{ title: 'Hello', pageViews: 3, subtitle: '' }}
        onDirtyChange={onDirtyChange}
        {...props}
        onSubmit={onSubmit}
      />
      <button type="submit" form="doc-form">
        Save
      </button>
    </>,
  );
  return { onSubmit, onDirtyChange, user: userEvent.setup() };
}

describe('SchemaForm layout (AC-7)', () => {
  it('renders each field with a visible label and its width span', () => {
    renderForm();

    const title = screen.getByLabelText('Title');
    expect(title).toHaveValue('Hello');
    expect(title.closest('[data-slot="field"]')).toHaveClass('md:col-span-3');
    const views = screen.getByLabelText('Page views');
    expect(views).toHaveValue('3');
    expect(views).toHaveAttribute('inputmode', 'decimal');
    expect(views.closest('[data-slot="field"]')).toHaveClass('md:col-span-2');
    // Any other width is full width.
    expect(screen.getByLabelText('Subtitle').closest('[data-slot="field"]')).toHaveClass(
      'md:col-span-6',
    );
  });

  it('lays the fields out in a 6-column grid from md, one column below', () => {
    renderForm();

    const form = screen.getByRole('form', { name: 'Fields' });
    expect(form).toHaveClass('grid-cols-1', 'md:grid-cols-6');
  });

  it('starts from empty values for a never-saved document', () => {
    renderForm({ document: null });

    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Page views')).toHaveValue('');
  });
});

describe('SchemaForm submit (AC-8, AC-15)', () => {
  it('sends only schema fields, with number text converted', async () => {
    const { onSubmit, user } = renderForm({
      document: { title: 'Hello', pageViews: 3, subtitle: '', status: 'draft', extra: 1 },
    });

    await user.clear(screen.getByLabelText('Page views'));
    await user.type(screen.getByLabelText('Page views'), '12.5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Hello', pageViews: 12.5, subtitle: '' });
  });

  it('sends null for an emptied number', async () => {
    const { onSubmit, user } = renderForm();

    await user.clear(screen.getByLabelText('Page views'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ pageViews: null })),
    );
  });

  it('shows "Enter a number.", focuses the field and sends nothing; fixing it clears the error', async () => {
    const { onSubmit, user } = renderForm();
    const views = screen.getByLabelText('Page views');

    await user.clear(views);
    await user.type(views, '12abc');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number.');
    expect(views).toHaveAttribute('aria-invalid', 'true');
    expect(views).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(views);
    await user.type(views, '12');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(views).not.toHaveAttribute('aria-invalid');
  });

  it('validates a number on blur once touched', async () => {
    const { user } = renderForm();

    await user.type(screen.getByLabelText('Page views'), 'x');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number.');
  });

  it('reports dirty state and resets to the saved document after a save', async () => {
    const onSubmit = vi.fn(async (data: DocumentData) => ({ ...data, title: 'Saved title' }));
    const { onDirtyChange, user } = renderForm({ onSubmit });

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.type(screen.getByLabelText('Title'), '!');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    expect(screen.getByLabelText('Title')).toHaveValue('Saved title');
  });

  it('shows every 400 message in a focused alert and keeps the typed values dirty', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError({
        status: 400,
        message: 'title must be shorter',
        messages: ['title must be shorter', 'pageViews must be positive'],
      });
    });
    const { onDirtyChange, user } = renderForm({ onSubmit });

    await user.type(screen.getByLabelText('Title'), ' world');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('title must be shorter');
    expect(alert).toHaveTextContent('pageViews must be positive');
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText('Title')).toHaveValue('Hello world');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('clears the server alert on the next successful save', async () => {
    const onSubmit = vi
      .fn<(data: DocumentData) => Promise<DocumentData>>()
      .mockRejectedValueOnce(new ApiError({ status: 400, message: 'Bad title' }))
      .mockImplementation(async (data) => data);
    const { user } = renderForm({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad title');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('shows "no access" for a server 403', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError({ status: 403, message: 'Forbidden resource' });
    });
    const { user } = renderForm({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have access to do this.");
  });

  it('shows a generic message for a non-API failure', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('boom');
    });
    const { user } = renderForm({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save. Try again.");
  });
});

describe('SchemaForm read-only mode (AC-14)', () => {
  it('makes every control read-only, shows the reason and sends nothing', async () => {
    const { onSubmit, user } = renderForm({
      readOnly: true,
      readOnlyReason: 'You need the update permission.',
    });

    expect(screen.getByText('You need the update permission.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Page views')).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('falls back to a generic reason', () => {
    renderForm({ readOnly: true });

    expect(screen.getByText("You don't have permission to edit this entry.")).toBeInTheDocument();
  });
});

describe('SchemaField dispatch', () => {
  it('renders a richtext field as text until its editor lands', () => {
    renderForm({
      fields: [{ name: 'body', type: 'richtext' as FieldType }],
      document: { body: '<p>Hi</p>' },
    });

    expect(screen.getByLabelText('Body')).toHaveValue('<p>Hi</p>');
  });
});
