import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UnsavedChangesDialog } from './UnsavedChangesDialog';

describe('UnsavedChangesDialog', () => {
  it('renders nothing while the guard is closed', () => {
    render(<UnsavedChangesDialog guard={{ open: false, stay: vi.fn(), leave: vi.fn() }} />);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Discard calls leave and does not call stay', async () => {
    const user = userEvent.setup();
    const guard = { open: true, stay: vi.fn(), leave: vi.fn() };
    render(<UnsavedChangesDialog guard={guard} />);

    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(guard.leave).toHaveBeenCalledTimes(1));
    expect(guard.stay).not.toHaveBeenCalled();
  });

  it('Cancel calls stay and keeps the edits', async () => {
    const user = userEvent.setup();
    const guard = { open: true, stay: vi.fn(), leave: vi.fn() };
    render(<UnsavedChangesDialog guard={guard} />);

    expect(
      await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(guard.stay).toHaveBeenCalledTimes(1);
    expect(guard.leave).not.toHaveBeenCalled();
  });
});
