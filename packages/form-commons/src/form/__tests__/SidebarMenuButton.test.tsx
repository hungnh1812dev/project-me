import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SidebarMenuButton, SidebarProvider } from '../../components/sidebar';

describe('SidebarMenuButton', () => {
  it('draws the active indicator in the highlight colour, only when active (AC-14)', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton isActive>Users</SidebarMenuButton>
        <SidebarMenuButton>Roles</SidebarMenuButton>
      </SidebarProvider>,
    );

    const active = screen.getByRole('button', { name: 'Users' });
    expect(active).toHaveAttribute('data-active');
    expect(active).toHaveClass('data-active:before:bg-highlight');
    expect(screen.getByRole('button', { name: 'Roles' })).not.toHaveAttribute('data-active');
  });
});
