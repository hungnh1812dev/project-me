import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { buildColumnCatalog } from '@/features/content/columns';
import type { ListFilter } from '@/features/content/listState';
import { makeContentType } from '@/test/contentFixtures';
import { renderWithProviders } from '@/test/renderWithProviders';

import { FilterChips } from './FilterChips';
import { FilterPanel, type FilterPanelProps } from './FilterPanel';

const CATALOG = buildColumnCatalog(makeContentType());

function renderPanel(overrides: Partial<FilterPanelProps> = {}) {
  const props: FilterPanelProps = {
    catalog: CATALOG,
    filters: {},
    onApply: vi.fn(),
    locale: 'en-US',
    ...overrides,
  };
  return { props, ...renderWithProviders(<FilterPanel {...props} />) };
}

const row = (n: number) => screen.getByRole('group', { name: `Filter ${n}` });

async function choose(user: UserEvent, combobox: HTMLElement, option: string) {
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: option }));
}

const optionNames = async () =>
  (await screen.findAllByRole('option')).map((option) => option.textContent);

describe('FilterPanel (AC-22)', () => {
  it('is a labelled region that starts with one empty row', () => {
    renderPanel();

    expect(screen.getByRole('region', { name: 'Filters' })).toBeInTheDocument();
    const first = row(1);
    expect(within(first).getByRole('combobox', { name: 'Field' })).toHaveTextContent(
      'Choose a field',
    );
    expect(within(first).getByRole('combobox', { name: 'Operator' })).toHaveAttribute(
      'data-disabled',
    );
  });

  it('offers only filterable fields, with no Status field', async () => {
    const { user } = renderPanel();

    await user.click(within(row(1)).getByRole('combobox', { name: 'Field' }));

    expect(await optionNames()).toEqual([
      'ID',
      'Document ID',
      'Created',
      'Updated',
      'Published',
      'Title',
      'Views',
      'Featured',
    ]);
    expect(screen.queryByRole('option', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('offers only the operators of the chosen field kind', async () => {
    const { user } = renderPanel();

    await choose(user, within(row(1)).getByRole('combobox', { name: 'Field' }), 'Title');
    await user.click(within(row(1)).getByRole('combobox', { name: 'Operator' }));
    expect(await optionNames()).toEqual(['is', 'is not', 'contains']);
    await user.keyboard('{Escape}');

    await choose(user, within(row(1)).getByRole('combobox', { name: 'Field' }), 'Views');
    await user.click(within(row(1)).getByRole('combobox', { name: 'Operator' }));
    expect(await optionNames()).toEqual([
      'is',
      'is not',
      'is greater than',
      'is at least',
      'is less than',
      'is at most',
    ]);
  });

  it('applies a text filter', async () => {
    const { props, user } = renderPanel();

    await choose(user, within(row(1)).getByRole('combobox', { name: 'Field' }), 'Title');
    await choose(user, within(row(1)).getByRole('combobox', { name: 'Operator' }), 'contains');
    await user.type(within(row(1)).getByRole('textbox', { name: 'Value' }), ' hello ');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(props.onApply).toHaveBeenCalledWith({ title: { op: '$contains', value: 'hello' } });
  });

  it('applies a number filter from a number input', async () => {
    const { props, user } = renderPanel();

    await choose(user, within(row(1)).getByRole('combobox', { name: 'Field' }), 'Views');
    await choose(user, within(row(1)).getByRole('combobox', { name: 'Operator' }), 'is at least');
    const input = within(row(1)).getByRole('spinbutton', { name: 'Value' });
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(props.onApply).toHaveBeenCalledWith({ views: { op: '$gte', value: '10' } });
  });

  it('applies a boolean filter from a Yes/No select', async () => {
    const { props, user } = renderPanel();

    await choose(user, within(row(1)).getByRole('combobox', { name: 'Field' }), 'Featured');
    await user.click(within(row(1)).getByRole('combobox', { name: 'Value' }));
    expect(await optionNames()).toEqual(['Yes', 'No']);
    await user.click(screen.getByRole('option', { name: 'No' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(props.onApply).toHaveBeenCalledWith({ featured: { op: '$eq', value: 'false' } });
  });

  it('applies a date filter picked in the DatePicker as an ISO value', async () => {
    const { props, user } = renderPanel({
      filters: { createdAt: { op: '$gte', value: new Date(2026, 0, 15).toISOString() } },
    });

    const trigger = within(row(1)).getByRole('button', { name: 'Value' });
    expect(trigger).toHaveTextContent('Jan 15, 2026');
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Choose a date' });
    await waitFor(() =>
      expect(document.querySelector('[data-day="2026-01-15"]')).toContainElement(
        document.activeElement as HTMLElement,
      ),
    );
    await user.keyboard('{ArrowRight}{Enter}');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(props.onApply).toHaveBeenCalledWith({
      createdAt: { op: '$gte', value: new Date(2026, 0, 16).toISOString() },
    });
  });

  it('starts from the active filters, one row each', () => {
    renderPanel({
      filters: { title: { op: '$eq', value: 'Hi' }, featured: { op: '$ne', value: 'true' } },
    });

    expect(within(row(1)).getByRole('combobox', { name: 'Field' })).toHaveTextContent('Title');
    expect(within(row(1)).getByRole('textbox', { name: 'Value' })).toHaveValue('Hi');
    expect(within(row(2)).getByRole('combobox', { name: 'Field' })).toHaveTextContent('Featured');
    expect(within(row(2)).getByRole('combobox', { name: 'Operator' })).toHaveTextContent('is not');
    expect(within(row(2)).getByRole('combobox', { name: 'Value' })).toHaveTextContent('Yes');
  });

  it('does not offer a field that another row uses', async () => {
    const { user } = renderPanel({ filters: { title: { op: '$eq', value: 'Hi' } } });

    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    await user.click(within(row(2)).getByRole('combobox', { name: 'Field' }));

    expect(await optionNames()).not.toContain('Title');
  });

  it('blocks Apply while a chosen field has no valid value', async () => {
    const { props, user } = renderPanel();

    await choose(user, within(row(1)).getByRole('combobox', { name: 'Field' }), 'Title');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(within(row(1)).getByRole('textbox', { name: 'Value' })).toHaveAccessibleDescription(
      'Enter a value.',
    );
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it('removes a row, and skips rows with no field', async () => {
    const { props, user } = renderPanel({
      filters: { title: { op: '$eq', value: 'Hi' }, views: { op: '$gt', value: '3' } },
    });

    await user.click(within(row(1)).getByRole('button', { name: 'Remove filter 1' }));
    await user.click(screen.getByRole('button', { name: 'Add filter' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(props.onApply).toHaveBeenCalledWith({ views: { op: '$gt', value: '3' } });
  });

  it('clears every filter with Clear all', async () => {
    const { props, user } = renderPanel({ filters: { title: { op: '$eq', value: 'Hi' } } });

    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(props.onApply).toHaveBeenCalledWith({});
  });

  it('disables Add filter once every field has a row', async () => {
    const filters: Record<string, ListFilter> = Object.fromEntries(
      Object.keys(CATALOG.filterable).map((key) => [key, { op: '$eq', value: '1' }]),
    );
    renderPanel({ filters });

    expect(screen.getByRole('button', { name: 'Add filter' })).toBeDisabled();
  });
});

describe('FilterChips (AC-22)', () => {
  it('renders a removable chip per filter, and nothing without filters', async () => {
    const onRemove = vi.fn();
    const { user, rerender } = renderWithProviders(
      <FilterChips
        catalog={CATALOG}
        filters={{ featured: { op: '$eq', value: 'true' }, views: { op: '$ne', value: '2' } }}
        onRemove={onRemove}
        locale="en-US"
      />,
    );

    const list = screen.getByRole('list', { name: 'Active filters' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Featured is Yes, remove' }));
    expect(onRemove).toHaveBeenCalledWith('featured');

    rerender(<FilterChips catalog={CATALOG} filters={{}} onRemove={onRemove} />);
    expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument();
  });
});
