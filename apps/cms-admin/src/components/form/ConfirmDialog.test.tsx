import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@repo/ui/components/button';

import { ConfirmDialog } from './ConfirmDialog';

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue(undefined);
  render(
    <ConfirmDialog
      trigger={<Button variant="outline">Delete jane@example.com</Button>}
      title="Delete user?"
      description="jane@example.com loses access right away."
      confirmLabel="Delete user"
      {...props}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, trigger: screen.getByRole('button', { name: 'Delete jane@example.com' }) };
}

describe('ConfirmDialog', () => {
  it('opens a modal alertdialog named by its title, with Cancel focused first', async () => {
    const { trigger } = setup();

    await userEvent.click(trigger);

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete user?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('jane@example.com loses access right away.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('uses a destructive confirm button with the verb label', async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);

    const confirm = await screen.findByRole('button', { name: 'Delete user' });

    expect(confirm.className).toMatch(/bg-destructive/);
  });

  it('closes on Cancel and returns focus to the trigger', async () => {
    const { trigger, onConfirm } = setup();
    await userEvent.click(trigger);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const { trigger } = setup();
    await userEvent.click(trigger);
    await screen.findByRole('alertdialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('shows loading while onConfirm runs, ignores a second click, then closes', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const { trigger } = setup({ onConfirm });
    await userEvent.click(trigger);
    const confirm = await screen.findByRole('button', { name: 'Delete user' });

    await userEvent.click(confirm);
    await userEvent.click(confirm);

    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(onConfirm).toHaveBeenCalledTimes(1);

    resolve();

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('stays open when onConfirm rejects, so the error can show', async () => {
    const Harness = () => {
      const [error, setError] = useState<string | null>(null);
      return (
        <ConfirmDialog
          trigger={<Button>Delete role</Button>}
          title="Delete role?"
          confirmLabel="Delete role"
          error={error}
          onConfirm={async () => {
            setError('The role is still assigned to 2 users.');
            throw new Error('409');
          }}
        />
      );
    };
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete role' }));

    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete role' }).at(-1)!);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The role is still assigned to 2 users.',
    );
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete role' }).at(-1)).not.toHaveAttribute(
      'aria-busy',
    );
  });

  it('renders children inside the dialog (the conflict slot)', async () => {
    const { trigger } = setup({ children: <p>Used by 3 roles.</p> });
    await userEvent.click(trigger);

    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent('Used by 3 roles.');
  });

  it('can be controlled with open and onOpenChange', async () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Revoke token?"
        confirmLabel="Revoke token"
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Revoke token' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('hides the confirm button and focuses Cancel when hideConfirm turns on', async () => {
    const Harness = () => {
      const [hidden, setHidden] = useState(false);
      return (
        <ConfirmDialog
          open
          title="Delete permission?"
          confirmLabel="Delete permission"
          cancelLabel={hidden ? 'Close' : 'Cancel'}
          hideConfirm={hidden}
          onConfirm={async () => {
            setHidden(true);
            throw new Error('409');
          }}
        />
      );
    };
    render(<Harness />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete permission' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Delete permission' })).not.toBeInTheDocument();
  });
});
