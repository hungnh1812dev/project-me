import { useState } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/core/api/apiError';

import { ListState, type ListStateProps } from './ListState';
import { LiveRegion } from './LiveRegion';
import { SearchField } from './SearchField';
import { useAnnouncer } from './useAnnouncer';

const NOUN = { one: 'user', other: 'users' };

function renderList(props: Partial<ListStateProps> = {}) {
  const refetch = vi.fn();
  render(
    <ListState
      isPending={false}
      error={null}
      refetch={refetch}
      noun={NOUN}
      total={2}
      visible={2}
      search=""
      {...props}
    >
      <table aria-label="Users table" />
    </ListState>,
  );
  return { refetch };
}

describe('ListState (AC-3)', () => {
  it('shows skeleton rows marked busy while loading', () => {
    renderList({ isPending: true });

    expect(screen.getByRole('group', { name: 'Loading users' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the error with a Retry button that refetches', async () => {
    const { refetch } = renderList({
      error: new ApiError({ status: 500, message: 'Server exploded.' }),
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Server exploded.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows "no access" without Retry on a server 403', () => {
    renderList({ error: new ApiError({ status: 403, message: 'Forbidden resource' }) });

    expect(screen.getByRole('alert')).toHaveTextContent("You don't have access to users.");
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows the empty state with the primary action when allowed', () => {
    renderList({ total: 0, visible: 0, emptyAction: <button type="button">New user</button> });

    expect(screen.getByText('No users yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New user' })).toBeInTheDocument();
  });

  it('shows the no-match state for a search with no results', () => {
    renderList({ total: 2, visible: 0, search: ' zed ' });

    expect(screen.getByText('No users match "zed".')).toBeInTheDocument();
  });

  it('renders the list when there are visible items', () => {
    renderList();

    expect(screen.getByRole('table', { name: 'Users table' })).toBeInTheDocument();
  });
});

describe('SearchField (AC-4)', () => {
  const Harness = ({ total }: { total: (q: string) => number }) => {
    const [query, setQuery] = useState('');
    return <SearchField noun={NOUN} value={query} onChange={setQuery} count={total(query)} />;
  };

  it('is a labelled search box that reports changes', async () => {
    render(<Harness total={() => 3} />);
    const box = screen.getByRole('searchbox', { name: 'Search users' });

    await userEvent.type(box, 'ja');

    expect(box).toHaveValue('ja');
  });

  it('announces the result count politely, singular and plural', async () => {
    render(<Harness total={(q) => (q ? 1 : 3)} />);
    const status = screen.getByRole('status');

    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('3 users');

    await userEvent.type(screen.getByRole('searchbox'), 'j');

    expect(status).toHaveTextContent('1 user');
  });
});

describe('useAnnouncer and LiveRegion (AC-10)', () => {
  it('renders the announced message in a polite status region', () => {
    const Page = () => {
      const { message, announce } = useAnnouncer();
      return (
        <>
          <button type="button" onClick={() => announce('Role "Writer" created.')}>
            Create
          </button>
          <LiveRegion message={message} />
        </>
      );
    };
    render(<Page />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();

    act(() => screen.getByRole('button', { name: 'Create' }).click());

    expect(region).toHaveTextContent('Role "Writer" created.');
  });

  it('changes the text when the same message is announced twice, so it is read again', () => {
    const { result } = renderHook(() => useAnnouncer());

    act(() => result.current.announce('Saved.'));
    const first = result.current.message;
    act(() => result.current.announce('Saved.'));

    expect(result.current.message).not.toBe(first);
    expect(result.current.message.trim()).toBe('Saved.');
  });
});
