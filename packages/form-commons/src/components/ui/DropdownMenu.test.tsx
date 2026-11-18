import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu';

function renderMenu(onSelect = vi.fn<() => void>()) {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Account</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Signed in</DropdownMenuLabel>
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSelect}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return screen.getByRole('button', { name: 'Account' });
}

describe('DropdownMenu', () => {
  it.each(['{Enter}', ' ', '{ArrowDown}'])('opens with the key %j', async (key) => {
    const trigger = renderMenu();
    trigger.focus();
    await userEvent.keyboard(key);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('moves with arrow keys, selects with Enter', async () => {
    const onSelect = vi.fn<() => void>();
    const trigger = renderMenu(onSelect);
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await screen.findByRole('menu');
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('Escape closes and returns focus to the trigger', async () => {
    const trigger = renderMenu();
    await userEvent.click(trigger);
    await screen.findByRole('menu');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('rounds items with the item radius and the menu with the surface radius', async () => {
    const trigger = renderMenu();
    await userEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveClass('rounded-surface');
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item).toHaveClass('rounded-item');
    }
  });
});
