import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { DiffViewerBlock } from './DiffViewerBlock';

function setup(choice: 'server' | 'client' = 'client') {
  const onChoiceChange = vi.fn<(side: string) => void>();
  render(
    <DiffViewerBlock
      name="d1"
      title="Position"
      changeLabel="Changed"
      server={{ label: 'Saved version', content: 'Engineer' }}
      client={{ label: 'Your version', content: null }}
      choice={choice}
      onChoiceChange={onChoiceChange}
      emptyText="No value"
    />,
  );
  return { onChoiceChange };
}

describe('DiffViewerBlock', () => {
  it('shows both sides, with empty text for a missing value', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Position' })).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('No value')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Your version/ })).toBeChecked();
  });

  it('reports the chosen side', async () => {
    const { onChoiceChange } = setup();
    await userEvent.click(screen.getByRole('radio', { name: /Saved version/ }));
    expect(onChoiceChange).toHaveBeenCalledWith('server');
  });
});
