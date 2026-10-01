import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeMeUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';

import AdminHomePage from './AdminHomePage';

describe('AdminHomePage', () => {
  it('greets the user by name and links to the profile', () => {
    renderWithProviders(<AdminHomePage />, {
      auth: { status: 'authenticated', user: makeMeUser({ name: 'Jane Doe' }) },
    });

    expect(screen.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Your profile' })).toHaveAttribute(
      'href',
      '/admin/profile',
    );
  });

  it('is a welcome card whose profile link is styled as a button (AC-38)', () => {
    renderWithProviders(<AdminHomePage />, {
      auth: { status: 'authenticated', user: makeMeUser({ name: 'Jane Doe' }) },
    });

    const heading = screen.getByRole('heading', { name: 'Welcome, Jane Doe' });
    expect(heading.closest('[data-slot="card"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Your profile' })).toHaveClass('inline-flex');
  });
});
