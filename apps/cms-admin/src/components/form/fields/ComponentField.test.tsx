import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentData, FieldDefinition } from '@/features/content/types';

import { SchemaForm } from '../SchemaForm';

const FIELDS: FieldDefinition[] = [
  {
    name: 'seo',
    type: 'component',
    component: 'shared.seo',
    width: '50%',
    fields: [
      { name: 'metaTitle', type: 'text', header: true, width: '50%' },
      { name: 'priority', type: 'number' },
      {
        name: 'social',
        type: 'component',
        component: 'shared.social',
        fields: [
          { name: 'network', type: 'text' },
          { name: 'handle', type: 'text', header: true },
        ],
      },
    ],
  },
];

function renderForm(document: DocumentData | null, readOnly = false) {
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

const DOC: DocumentData = {
  seo: { metaTitle: 'Hello', priority: 2, social: { network: 'x', handle: '@jane' } },
};

describe('ComponentField (AC-9)', () => {
  it('renders a top-level component as a fieldset labelled by its legend, with its width span', () => {
    renderForm(DOC);

    const seo = screen.getByRole('group', { name: 'Seo' });
    expect(seo.tagName).toBe('FIELDSET');
    expect(within(seo).getByText('Seo', { selector: 'legend' })).toBeVisible();
    expect(seo).toHaveClass('md:col-span-3');
    expect(within(seo).getByLabelText('Meta title')).toHaveValue('Hello');
    expect(within(seo).getByLabelText('Meta title').closest('[data-slot="field"]')).toHaveClass(
      'md:col-span-3',
    );
    expect(within(seo).getByLabelText('Priority')).toHaveValue('2');
  });

  it('renders a nested component as an open, collapsible details with its hint', async () => {
    const { user } = renderForm(DOC);

    const social = screen.getByRole('group', { name: 'Social' });
    const details = social.closest('details')!;
    expect(details).toHaveAttribute('open');
    const summary = details.querySelector('summary')!;
    expect(summary).toHaveTextContent('Social');
    // The header text field gives the hint.
    expect(summary).toHaveTextContent('@jane');
    expect(within(social).getByLabelText('Network')).toHaveValue('x');

    await user.click(summary);
    expect(details).not.toHaveAttribute('open');
  });

  it('updates the hint as its text fields change', async () => {
    const { user } = renderForm(DOC);

    const handle = screen.getByLabelText('Handle');
    await user.clear(handle);
    await user.type(handle, '@john');

    expect(
      screen.getByRole('group', { name: 'Social' }).closest('details')!.querySelector('summary'),
    ).toHaveTextContent('@john');
  });

  it('shows no hint when the nested component has no text value', () => {
    renderForm(null);

    const summary = screen
      .getByRole('group', { name: 'Social' })
      .closest('details')!
      .querySelector('summary')!;
    expect(summary).toHaveTextContent(/^Social$/);
  });

  it('saves its nested values under the full name paths', async () => {
    const { onSubmit, user } = renderForm(DOC);

    await user.clear(screen.getByLabelText('Network'));
    await user.type(screen.getByLabelText('Network'), 'mastodon');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        seo: { metaTitle: 'Hello', priority: 2, social: { network: 'mastodon', handle: '@jane' } },
      }),
    );
  });

  it('keeps its nested controls read-only in read-only mode', () => {
    renderForm(DOC, true);

    expect(screen.getByLabelText('Meta title')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Handle')).toHaveAttribute('readonly');
  });
});
