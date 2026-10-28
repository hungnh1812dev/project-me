import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { BulkActionBar } from './BulkActionBar';

const LABELS = {
  region: 'Bulk actions',
  selected: (count: number) => `${count} selected`,
  clear: 'Clear selection',
};

describe('BulkActionBar', () => {
  it('renders nothing without a selection', () => {
    const { container } = render(
      <BulkActionBar
        selectedCount={0}
        actions={[]}
        onClear={() => undefined}
        labels={LABELS}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count, runs an action and clears', async () => {
    const onPublish = vi.fn<() => void>();
    const onClear = vi.fn<() => void>();
    const user = userEvent.setup();
    render(
      <BulkActionBar
        selectedCount={3}
        actions={[
          {
            id: 'publish',
            label: 'Publish 3',
            variant: 'success',
            onClick: onPublish,
          },
        ]}
        onClear={onClear}
        labels={LABELS}
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Bulk actions' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish 3' }));
    expect(onPublish).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('disables everything while busy', () => {
    render(
      <BulkActionBar
        selectedCount={2}
        actions={[
          { id: 'delete', label: 'Delete 2', onClick: () => undefined },
        ]}
        onClear={() => undefined}
        labels={LABELS}
        busy
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete 2' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Clear selection' }),
    ).toBeDisabled();
  });
});
