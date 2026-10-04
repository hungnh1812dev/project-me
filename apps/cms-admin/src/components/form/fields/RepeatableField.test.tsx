import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentData, FieldDefinition } from '@/features/content/types';

import { SchemaForm } from '../SchemaForm';

const FIELDS: FieldDefinition[] = [
  {
    name: 'gallery',
    type: 'component',
    component: 'media.gallery-item',
    repeatable: true,
    fields: [
      { name: 'caption', type: 'text', header: true },
      { name: 'credit', type: 'text' },
      {
        name: 'tags',
        type: 'component',
        component: 'shared.tag',
        repeatable: true,
        fields: [{ name: 'label', type: 'text' }],
      },
    ],
  },
];

const DOC: DocumentData = {
  gallery: [
    { caption: 'First', credit: 'A', tags: [{ label: 'red' }, { label: 'blue' }] },
    { caption: 'Second', credit: 'B', tags: [] },
    { caption: 'Third', credit: 'C', tags: [{ label: 'green' }] },
  ],
};

function renderForm(document: DocumentData | null = DOC, readOnly = false) {
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

const entry = (label: string) => screen.getByRole('group', { name: label });
const captions = () =>
  screen.getAllByLabelText('Caption').map((input) => (input as HTMLInputElement).value);
const status = () => screen.getByRole('status');

async function savedGallery(
  user: ReturnType<typeof userEvent.setup>,
  onSubmit: ReturnType<typeof vi.fn>,
) {
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  return (onSubmit.mock.lastCall![0] as { gallery: unknown }).gallery;
}

describe('RepeatableField (AC-10)', () => {
  it('renders a labelled group with one labelled entry per item, each with its hint', () => {
    renderForm();

    const gallery = screen.getByRole('group', { name: 'Gallery' });
    expect(within(gallery).getByText('Gallery', { selector: 'legend' })).toBeVisible();
    expect(entry('Gallery item 1')).toHaveAccessibleDescription('First');
    expect(within(entry('Gallery item 2')).getByLabelText('Credit')).toHaveValue('B');
    expect(captions()).toEqual(['First', 'Second', 'Third']);
    expect(screen.getByRole('button', { name: 'Move Gallery item 2 up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Gallery item 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Gallery item 3 down' })).toBeDisabled();
  });

  it('shows an empty state and only the Add button without entries', () => {
    renderForm(null);

    expect(screen.getByText('No items yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add gallery item' })).toBeEnabled();
  });

  it('adds an empty entry, focuses its first control and announces it', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Add gallery item' }));

    const added = entry('Gallery item 4');
    expect(within(added).getByLabelText('Caption')).toHaveValue('');
    expect(within(added).getByLabelText('Caption')).toHaveFocus();
    expect(status()).toHaveTextContent('Gallery item 4 added.');
  });

  it('moves an entry with its values, keeps focus on it and announces the move', async () => {
    const { user } = renderForm();
    // An unsaved edit must travel with its entry.
    await user.type(within(entry('Gallery item 1')).getByLabelText('Credit'), '!');

    await user.click(screen.getByRole('button', { name: 'Move Gallery item 1 down' }));

    expect(captions()).toEqual(['Second', 'First', 'Third']);
    expect(within(entry('Gallery item 2')).getByLabelText('Credit')).toHaveValue('A!');
    expect(within(entry('Gallery item 2')).getAllByLabelText('Label')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Move Gallery item 2 down' })).toHaveFocus();
    expect(status()).toHaveTextContent('Gallery item 1 moved to position 2.');

    await user.click(screen.getByRole('button', { name: 'Move Gallery item 2 up' }));
    expect(captions()).toEqual(['First', 'Second', 'Third']);
    // Item 1 can't move up, so focus goes to its Move down button.
    expect(screen.getByRole('button', { name: 'Move Gallery item 1 down' })).toHaveFocus();
  });

  it('moves using only the keyboard', async () => {
    const { user } = renderForm();

    screen.getByRole('button', { name: 'Move Gallery item 3 up' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    expect(captions()).toEqual(['Third', 'First', 'Second']);
    expect(screen.getByRole('button', { name: 'Move Gallery item 1 down' })).toHaveFocus();
  });

  it('saves the entries in the order shown after moves', async () => {
    const { onSubmit, user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Move Gallery item 3 up' }));
    await user.click(screen.getByRole('button', { name: 'Move Gallery item 1 down' }));

    expect(await savedGallery(user, onSubmit)).toEqual([
      { caption: 'Third', credit: 'C', tags: [{ label: 'green' }] },
      { caption: 'First', credit: 'A', tags: [{ label: 'red' }, { label: 'blue' }] },
      { caption: 'Second', credit: 'B', tags: [] },
    ]);
  });

  it('after Remove focuses the next entry, else the previous one, else Add', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Remove Gallery item 2' }));
    expect(captions()).toEqual(['First', 'Third']);
    expect(status()).toHaveTextContent('Gallery item 2 removed.');
    expect(screen.getByRole('button', { name: 'Remove Gallery item 2' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(captions()).toEqual(['First']);
    expect(screen.getByRole('button', { name: 'Remove Gallery item 1' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.queryAllByLabelText('Caption')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Add gallery item' })).toHaveFocus();
    expect(status()).toHaveTextContent('Gallery item 1 removed.');
  });

  it('supports a repeatable nested inside an entry, on its full name path', async () => {
    const { onSubmit, user } = renderForm();
    const first = entry('Gallery item 1');
    const tags = within(first).getByRole('group', { name: 'Tags' });

    await user.click(within(tags).getByRole('button', { name: 'Add tags item' }));
    const added = within(tags).getByRole('group', { name: 'Tags item 3' });
    expect(within(added).getByLabelText('Label')).toHaveFocus();
    await user.keyboard('yellow');

    await user.click(within(tags).getByRole('button', { name: 'Move Tags item 3 up' }));
    await user.click(within(tags).getByRole('button', { name: 'Move Tags item 2 up' }));
    expect(within(tags).getByRole('button', { name: 'Move Tags item 1 down' })).toHaveFocus();
    expect(
      within(tags)
        .getAllByLabelText('Label')
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['yellow', 'red', 'blue']);

    // The parent move carries the nested entries along.
    await user.click(screen.getByRole('button', { name: 'Move Gallery item 1 down' }));
    expect(
      within(entry('Gallery item 2'))
        .getAllByLabelText('Label')
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(['yellow', 'red', 'blue']);

    await user.click(
      within(entry('Gallery item 2')).getByRole('button', { name: 'Remove Tags item 2' }),
    );
    expect(await savedGallery(user, onSubmit)).toEqual([
      { caption: 'Second', credit: 'B', tags: [] },
      { caption: 'First', credit: 'A', tags: [{ label: 'yellow' }, { label: 'blue' }] },
      { caption: 'Third', credit: 'C', tags: [{ label: 'green' }] },
    ]);
  });

  it('updates an entry hint as its header field changes', async () => {
    const { user } = renderForm();

    const caption = within(entry('Gallery item 2')).getByLabelText('Caption');
    await user.clear(caption);
    await user.type(caption, 'Renamed');

    expect(entry('Gallery item 2')).toHaveAccessibleDescription('Renamed');
  });

  it('shows no Add, Move or Remove button in read-only mode', () => {
    renderForm(DOC, true);

    expect(entry('Gallery item 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Add|Move|Remove) /i })).toBeNull();
    expect(screen.getAllByLabelText('Caption')[0]).toHaveAttribute('readonly');
  });
});
