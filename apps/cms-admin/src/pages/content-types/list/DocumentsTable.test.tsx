import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildColumnCatalog } from '@/features/content/columns';
import type { ContentType, ListedDocumentItem } from '@/features/content/types';
import { makeContentType, makeListedItem } from '@/test/contentFixtures';
import { renderWithProviders } from '@/test/renderWithProviders';

import { DocumentsTable, type DocumentsTableProps } from './DocumentsTable';

const TYPE = makeContentType({ listFields: ['title', 'views', 'featured', 'updatedAt'] });

const ROWS: ListedDocumentItem[] = [
  makeListedItem({
    id: 2,
    documentId: 'doc-a',
    status: 'published',
    updatedAt: '2026-02-03T10:00:00.000Z',
    data: { title: 'Hello world', views: 12345, featured: true },
  }),
  makeListedItem({
    id: 1,
    documentId: 'doc-b',
    status: 'draft',
    updatedAt: '2026-01-05T10:00:00.000Z',
    data: { title: '', views: null, featured: false },
  }),
];

function renderTable(overrides: Partial<DocumentsTableProps> = {}, type: ContentType = TYPE) {
  const props: DocumentsTableProps = {
    type,
    catalog: buildColumnCatalog(type),
    items: ROWS,
    orderBy: 'id',
    sortDir: 'desc',
    onSortChange: vi.fn(),
    selected: new Set(),
    onSelectedChange: vi.fn(),
    ...overrides,
  };
  return { props, ...renderWithProviders(<DocumentsTable {...props} />) };
}

const headers = () =>
  screen.getAllByRole('columnheader').map((th) => th.textContent?.replace(/\s+/g, ' ').trim());

describe('DocumentsTable (AC-19)', () => {
  it('is a captioned table inside a labelled, focusable scroll region', () => {
    renderTable();

    const table = screen.getByRole('table', { name: 'Article entries' });
    const region = screen.getByRole('region', { name: 'Article entries' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toContainElement(table);
    expect(table.querySelector('caption')).toHaveTextContent('Article entries');
  });

  it('shows selection, the listFields in order, Status and Actions', () => {
    renderTable();

    expect(headers()).toEqual([
      'Select all entries on this page',
      'Title',
      'Views',
      'Featured',
      'Updated',
      'Status',
      'Actions',
    ]);
  });

  it('does not add Status twice when listFields already has it', () => {
    renderTable({}, makeContentType({ listFields: ['status', 'title'] }));

    expect(headers()).toEqual(['Select all entries on this page', 'Status', 'Title', 'Actions']);
  });

  it('skips a listField the catalog does not know', () => {
    renderTable({}, makeContentType({ listFields: ['title', 'body', 'ghost'] }));

    expect(headers()).toEqual(['Select all entries on this page', 'Title', 'Status', 'Actions']);
  });

  it('formats each cell for its kind', () => {
    renderTable();

    const [first, second] = screen.getAllByRole('row').slice(1);
    const cells = within(first!).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('Hello world');
    expect(cells[1]!.querySelector('[title="Hello world"]')).not.toBeNull();
    expect(cells[2]).toHaveTextContent('12,345');
    expect(cells[3]).toHaveTextContent('Yes');
    expect(cells[4]!.querySelector('[title="2026-02-03T10:00:00.000Z"]')).not.toBeNull();
    expect(within(cells[5]!).getByText('Published')).toHaveAttribute('data-slot', 'badge');

    const empty = within(second!).getAllByRole('cell');
    expect(empty[2]).toHaveTextContent('—');
    expect(empty[3]).toHaveTextContent('No');
    expect(within(empty[5]!).getByText('Draft')).toBeInTheDocument();
  });

  it('links the first text column to the entry, falling back to the documentId when empty', () => {
    renderTable();

    expect(screen.getByRole('link', { name: 'Hello world' })).toHaveAttribute(
      'href',
      '/admin/content-types/article/doc-a',
    );
    expect(screen.getByRole('link', { name: 'doc-b' })).toHaveAttribute(
      'href',
      '/admin/content-types/article/doc-b',
    );
  });

  it('links a documentId cell when there is no text column', () => {
    renderTable({}, makeContentType({ listFields: ['views'] }));

    expect(screen.getByRole('link', { name: 'doc-a' })).toHaveAttribute(
      'href',
      '/admin/content-types/article/doc-a',
    );
    expect(headers()).toContain('Document ID');
  });

  it('shows updatedBy by name', () => {
    renderTable({}, makeContentType({ listFields: ['title', 'updatedBy'] }));

    expect(within(screen.getAllByRole('row')[1]!).getByText('Jane Doe')).toBeInTheDocument();
  });

  it('renders the actions slot for each row', () => {
    renderTable({ renderActions: (item) => <span>menu {item.documentId}</span> });

    expect(screen.getByText('menu doc-a')).toBeInTheDocument();
    expect(screen.getByText('menu doc-b')).toBeInTheDocument();
  });

  it('marks the table busy while the next page loads', () => {
    renderTable({ busy: true });

    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('DocumentsTable sorting (AC-20)', () => {
  it('gives sortable headers a button and aria-sort, and others neither', () => {
    renderTable({ orderBy: 'updatedAt', sortDir: 'asc' });

    expect(screen.getByRole('columnheader', { name: 'Updated' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('columnheader', { name: 'Title' })).toHaveAttribute(
      'aria-sort',
      'none',
    );
    expect(screen.getByRole('button', { name: 'Title' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Status' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).not.toHaveAttribute('aria-sort');
  });

  it('sorts a newly chosen column descending first', async () => {
    const { props, user } = renderTable({ orderBy: 'updatedAt', sortDir: 'asc' });

    await user.click(screen.getByRole('button', { name: 'Views' }));

    expect(props.onSortChange).toHaveBeenCalledWith('views', 'desc');
  });

  it('flips the direction of the active column', async () => {
    const { props, user } = renderTable({ orderBy: 'updatedAt', sortDir: 'desc' });

    expect(screen.getByRole('columnheader', { name: 'Updated' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await user.click(screen.getByRole('button', { name: 'Updated' }));

    expect(props.onSortChange).toHaveBeenCalledWith('updatedAt', 'asc');
  });
});

describe('DocumentsTable selection', () => {
  it('selects one row by its checkbox', async () => {
    const { props, user } = renderTable();

    await user.click(screen.getByRole('checkbox', { name: 'Select Hello world' }));

    expect(props.onSelectedChange).toHaveBeenCalledWith(new Set(['doc-a']));
  });

  it('labels a row with no text by its documentId and unselects a selected row', async () => {
    const { props, user } = renderTable({ selected: new Set(['doc-a', 'doc-b']) });

    const box = screen.getByRole('checkbox', { name: 'Select doc-b' });
    expect(box).toBeChecked();
    expect(box.closest('tr')).toHaveAttribute('data-state', 'selected');
    await user.click(box);

    expect(props.onSelectedChange).toHaveBeenCalledWith(new Set(['doc-a']));
  });

  it('has an unchecked header checkbox that selects the whole page', async () => {
    const { props, user } = renderTable();

    const all = screen.getByRole('checkbox', { name: 'Select all entries on this page' });
    expect(all).not.toBeChecked();
    expect(all).toHaveProperty('indeterminate', false);
    await user.click(all);

    expect(props.onSelectedChange).toHaveBeenCalledWith(new Set(['doc-a', 'doc-b']));
  });

  it('shows a mixed header checkbox for a partial selection and selects all from it', async () => {
    const { props, user } = renderTable({ selected: new Set(['doc-b']) });

    const all = screen.getByRole('checkbox', { name: 'Select all entries on this page' });
    expect(all).toHaveProperty('indeterminate', true);
    await user.click(all);

    expect(props.onSelectedChange).toHaveBeenCalledWith(new Set(['doc-a', 'doc-b']));
  });

  it('clears the page from a checked header checkbox', async () => {
    const { props, user } = renderTable({ selected: new Set(['doc-a', 'doc-b']) });

    const all = screen.getByRole('checkbox', { name: 'Select all entries on this page' });
    expect(all).toBeChecked();
    await user.click(all);

    expect(props.onSelectedChange).toHaveBeenCalledWith(new Set());
  });
});
