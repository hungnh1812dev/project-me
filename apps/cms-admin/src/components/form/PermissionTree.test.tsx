import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Permission } from '@/features/settings/types';
import { makePermission } from '@/test/fixtures';

import { PermissionTree, type PermissionTreeProps } from './PermissionTree';

const perm = (slug: string, name: string, description: string | null = null) =>
  makePermission({ documentId: `id-${slug}`, slug, name, description });

const CATALOG: Permission[] = [
  perm('document:read', 'Read documents', 'Read every content type.'),
  perm('document:read:article', 'Read articles'),
  perm('document:update:article', 'Update articles'),
  perm('role:read', 'Read roles', 'List roles.'),
  perm('role:manager', 'Manage roles'),
];

/** Holds the selection like a form would, and reports every change. */
function Harness({
  initial = [],
  onChange = () => {},
  onSubmitForTest,
  ...props
}: Partial<PermissionTreeProps> & {
  initial?: string[];
  onSubmitForTest?: (event: React.FormEvent) => void;
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <form onSubmit={onSubmitForTest}>
      <PermissionTree
        catalog={CATALOG}
        canReadCatalog
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </form>
  );
}

const checkbox = (name: string | RegExp) => screen.getByRole('checkbox', { name });

describe('PermissionTree (AC-23)', () => {
  it('shows one labelled group per resource with "n of m", and document split by content type', () => {
    render(<Harness initial={['role:read']} />);

    expect(screen.getByRole('group', { name: 'Permissions' })).toBeInTheDocument();
    const role = screen.getByRole('group', { name: 'role' });
    expect(within(role).getByText('1 of 2')).toBeInTheDocument();
    expect(checkbox('role')).toHaveAccessibleDescription('1 of 2 selected');
    const documentGroup = screen.getByRole('group', { name: 'document' });
    expect(within(documentGroup).getByRole('group', { name: 'All content types' })).toBeVisible();
    expect(within(documentGroup).getByRole('group', { name: 'article' })).toBeVisible();
  });

  it('labels each permission with its slug and name, and describes it with its description', () => {
    render(<Harness />);

    const leaf = checkbox('role:read Read roles');
    // The @repo/ui Checkbox (AC-11), named by its visible text through aria-labelledby.
    expect(leaf).toHaveAttribute('data-slot', 'checkbox');
    expect(leaf).toHaveAttribute('aria-labelledby');
    expect(leaf).toHaveAccessibleDescription('List roles.');
    expect(screen.getByText('role:read').tagName).toBe('CODE');
  });

  it('leaves out a name that only repeats the slug', () => {
    render(<Harness catalog={[perm('media:read', 'media:read')]} />);

    expect(checkbox('media:read')).toBeInTheDocument();
  });

  it('puts no interactive element inside a label', () => {
    const { container } = render(<Harness initial={['role:read', 'ghost:x']} />);

    expect(container.querySelectorAll('label input, label button, label a')).toHaveLength(0);
  });

  it('toggles one permission', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(checkbox('role:read Read roles'));

    expect(onChange).toHaveBeenLastCalledWith(['role:read']);
    expect(checkbox('role:read Read roles')).toBeChecked();
  });

  it('shows a partly selected group as indeterminate, and a group click selects all of it', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['document:read:article']} onChange={onChange} />);
    const documentBox = checkbox('document');
    expect(documentBox).toHaveAttribute('aria-checked', 'mixed');
    expect(checkbox('Select all')).toHaveAttribute('aria-checked', 'mixed');

    await userEvent.click(documentBox);

    expect(onChange).toHaveBeenLastCalledWith([
      'document:read:article',
      'document:read',
      'document:update:article',
    ]);
    expect(documentBox).toHaveAttribute('aria-checked', 'true');
    expect(documentBox).toBeChecked();
    expect(checkbox('article')).toBeChecked();
  });

  it('clears every descendant when a checked group is clicked', async () => {
    const onChange = vi.fn();
    render(
      <Harness initial={['role:read', 'role:manager', 'document:read']} onChange={onChange} />,
    );

    await userEvent.click(checkbox('role'));

    expect(onChange).toHaveBeenLastCalledWith(['document:read']);
  });

  it('selects and clears the whole catalog with Select all, with its own count', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(checkbox('Select all')).toHaveAccessibleDescription('0 of 5 selected');

    await userEvent.click(checkbox('Select all'));
    expect(onChange.mock.lastCall?.[0]).toHaveLength(5);
    expect(checkbox('Select all')).toHaveAccessibleDescription('5 of 5 selected');

    await userEvent.click(checkbox('Select all'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('filters by slug, name or description, and Select all then covers only the matches', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter permissions' }), 'article');

    expect(screen.queryByRole('group', { name: 'role' })).not.toBeInTheDocument();
    expect(checkbox('document:read:article Read articles')).toBeInTheDocument();
    await userEvent.click(checkbox('Select all'));
    expect(onChange).toHaveBeenLastCalledWith(['document:read:article', 'document:update:article']);
  });

  it('says so when the filter matches nothing', async () => {
    render(<Harness />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter permissions' }), 'zzz');

    expect(screen.getByText('No permissions match "zzz".')).toBeInTheDocument();
  });

  it('does not submit the surrounding form when Enter is pressed in the filter', async () => {
    const onSubmitForTest = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(<Harness onSubmitForTest={onSubmitForTest} />);

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Filter permissions' }),
      'role{Enter}',
    );

    expect(onSubmitForTest).not.toHaveBeenCalled();
  });

  it('keeps selected slugs missing from the catalog under "Unknown permissions", uncheckable', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['ghost:read', 'role:read']} onChange={onChange} />);
    const unknown = screen.getByRole('group', { name: 'Unknown permissions' });
    const ghost = within(unknown).getByRole('checkbox', { name: 'ghost:read' });
    expect(ghost).toBeChecked();
    expect(ghost).toHaveAccessibleDescription('Not in the permission catalog.');

    await userEvent.click(ghost);

    expect(onChange).toHaveBeenLastCalledWith(['role:read']);
    // Still listed, so it can be re-checked.
    expect(within(unknown).getByRole('checkbox', { name: 'ghost:read' })).not.toBeChecked();
  });

  it('leaves unknown slugs out of Select all', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['ghost:read']} onChange={onChange} />);
    await userEvent.click(checkbox('ghost:read'));

    await userEvent.click(checkbox('Select all'));

    expect(onChange.mock.lastCall?.[0]).not.toContain('ghost:read');
  });

  it('gives every box an explicit name and toggles it from its visible text (AC-11)', async () => {
    const onChange = vi.fn();
    render(<Harness initial={['ghost:x']} onChange={onChange} />);

    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toHaveAttribute('data-slot', 'checkbox');
      const labelIds = box.getAttribute('aria-labelledby') ?? '';
      expect(labelIds).not.toBe('');
      for (const labelId of labelIds.split(' ')) expect(document.getElementById(labelId)).not.toBeNull();
    }
    expect(checkbox('role')).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(screen.getByText('Read roles'));
    expect(onChange).toHaveBeenLastCalledWith(['ghost:x', 'role:read']);
    await userEvent.click(screen.getByText('Select all'));
    expect(checkbox('Select all')).toBeChecked();
  });

  it('is operable with Tab and Space', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByRole('searchbox', { name: 'Filter permissions' }).focus();

    await userEvent.tab();
    expect(checkbox('Select all')).toHaveFocus();
    await userEvent.tab();
    expect(checkbox('document')).toHaveFocus();
    await userEvent.tab();
    expect(checkbox('All content types')).toHaveFocus();
    await userEvent.tab();
    expect(checkbox('document:read Read documents')).toHaveFocus();
    await userEvent.keyboard(' ');

    expect(onChange).toHaveBeenLastCalledWith(['document:read']);
  });

  it('without permission:read, lists the current slugs read-only with a note', () => {
    render(<Harness canReadCatalog={false} catalog={undefined} initial={['role:read', 'a:b']} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Permissions' })).toHaveTextContent('a:brole:read');
    expect(
      screen.getByText('Requires the "permission:read" permission to change permissions.'),
    ).toBeInTheDocument();
  });

  it('says so when read-only with no permissions', () => {
    render(<Harness canReadCatalog={false} catalog={undefined} />);

    expect(screen.getByText('No permissions.')).toBeInTheDocument();
  });

  it('shows a loading state while the catalog loads', () => {
    render(<Harness catalog={undefined} isLoading />);

    expect(screen.getByRole('group', { name: 'Permissions' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows the catalog error with a Retry', async () => {
    const onRetry = vi.fn();
    render(<Harness catalog={undefined} error="Network down." onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Network down.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says so when the catalog is empty', () => {
    render(<Harness catalog={[]} />);

    expect(screen.getByText('The permission catalog is empty.')).toBeInTheDocument();
  });
});
