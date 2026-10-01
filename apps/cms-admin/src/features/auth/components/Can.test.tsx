import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeMeUser, makeRole } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';

import { userLoaded } from '../store/AuthSlice';
import Can from './Can';

const signedInWith = (permissions: string[], level = 50) => ({
  auth: {
    status: 'authenticated' as const,
    user: makeMeUser({ documentId: 'me', role: makeRole({ permissions, level }) }),
  },
});

describe('<Can>', () => {
  it('renders the children when the policy allows', () => {
    renderWithProviders(
      <Can I="upload" a="media" fallback={<p>No access</p>}>
        <button type="button">Upload</button>
      </Can>,
      signedInWith(['media:manager']),
    );

    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.queryByText('No access')).not.toBeInTheDocument();
  });

  it('renders the fallback when the policy denies', () => {
    renderWithProviders(
      <Can I="upload" a="media" fallback={<p>No access</p>}>
        <button type="button">Upload</button>
      </Can>,
      signedInWith(['media:read']),
    );

    expect(screen.getByText('No access')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('renders nothing by default when denied', () => {
    const { container } = renderWithProviders(
      <Can I="read" a="media">
        <p>Media</p>
      </Can>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('passes the attributes to the policy', () => {
    renderWithProviders(
      <>
        <Can I="delete" a="user" with={{ targetUserId: 'other', targetLevel: 20 }}>
          <button type="button">Delete junior</button>
        </Can>
        <Can I="delete" a="user" with={{ targetUserId: 'other', targetLevel: 100 }}>
          <button type="button">Delete senior</button>
        </Can>
      </>,
      signedInWith(['user:manager']),
    );

    expect(screen.getByRole('button', { name: 'Delete junior' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete senior' })).not.toBeInTheDocument();
  });

  it('checks a permission slug instead of a policy', () => {
    renderWithProviders(
      <>
        <Can permission="role:read">
          <p>Roles</p>
        </Can>
        <Can permission={['role:read', 'user:read']} fallback={<p>No users</p>}>
          <p>Roles and users</p>
        </Can>
        <Can permission={['role:read', 'user:read']} mode="any">
          <p>Roles or users</p>
        </Can>
        <Can permission="document:update" contentTypeSlug="blog">
          <p>Edit blog</p>
        </Can>
      </>,
      signedInWith(['role:manager', 'document:update:blog']),
    );

    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByText('No users')).toBeInTheDocument();
    expect(screen.queryByText('Roles and users')).not.toBeInTheDocument();
    expect(screen.getByText('Roles or users')).toBeInTheDocument();
    expect(screen.getByText('Edit blog')).toBeInTheDocument();
  });

  it('calls a render function with the decision, allowed or denied', () => {
    renderWithProviders(
      <>
        <Can I="read" a="role">
          {(decision) => (
            <button type="button" disabled={!decision.allowed}>
              View roles
            </button>
          )}
        </Can>
        <Can I="delete" a="role" with={{ isDefault: true }} fallback={<p>ignored</p>}>
          {(decision) => (
            <button type="button" disabled={!decision.allowed} title={decision.reason ?? ''}>
              Delete role
            </button>
          )}
        </Can>
        <Can permission="user:read">{(decision) => <p>{decision.reason}</p>}</Can>
      </>,
      signedInWith(['role:manager']),
    );

    expect(screen.getByRole('button', { name: 'View roles' })).toBeEnabled();
    const deleteRole = screen.getByRole('button', { name: 'Delete role' });
    expect(deleteRole).toBeDisabled();
    expect(deleteRole).toHaveAttribute('title', 'A default role cannot be deleted.');
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
    expect(screen.getByText('Requires the "user:read" permission.')).toBeInTheDocument();
  });

  it('updates when the user permissions change', () => {
    const { store } = renderWithProviders(
      <Can I="read" a="media" fallback={<p>No access</p>}>
        <p>Media</p>
      </Can>,
      signedInWith([]),
    );
    expect(screen.getByText('No access')).toBeInTheDocument();

    act(() => {
      store.dispatch(userLoaded(makeMeUser({ role: makeRole({ permissions: ['media:read'] }) })));
    });

    expect(screen.getByText('Media')).toBeInTheDocument();
  });
});
