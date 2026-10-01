import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/renderWithProviders';

import UsersPage from './UsersPage';

describe('UsersPage', () => {
  it('is a placeholder until the settings phase', () => {
    renderWithProviders(<UsersPage />);

    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
  });
});
