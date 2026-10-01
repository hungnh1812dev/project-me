import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/renderWithProviders';

import SettingsPlaceholderPage from './SettingsPlaceholderPage';

describe('SettingsPlaceholderPage', () => {
  it('shows the page label as the heading and the Phase 4 notice (AC-26)', () => {
    renderWithProviders(<SettingsPlaceholderPage label="Access tokens" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Access tokens' })).toBeInTheDocument();
    expect(screen.getByText('Coming in Phase 4.')).toBeInTheDocument();
  });
});
