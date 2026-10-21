import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

function Example({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Disable account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable Mai Tran?</DialogTitle>
          <DialogDescription>They are signed out everywhere.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            Disable Mai Tran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('opens from its trigger with an accessible name and description', async () => {
    render(<Example onConfirm={() => undefined} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Disable account' }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Disable Mai Tran?' });
    expect(dialog).toHaveAccessibleDescription(
      'They are signed out everywhere.',
    );
  });

  it('closes on Esc and returns focus to the trigger', async () => {
    render(<Example onConfirm={() => undefined} />);
    const trigger = screen.getByRole('button', { name: 'Disable account' });
    await userEvent.click(trigger);

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes from DialogClose without running the action', async () => {
    const onConfirm = vi.fn<() => void>();
    render(<Example onConfirm={onConfirm} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Disable account' }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('runs the named action button', async () => {
    const onConfirm = vi.fn<() => void>();
    render(<Example onConfirm={onConfirm} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Disable account' }),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Disable Mai Tran' }),
    );

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
