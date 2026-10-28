import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Radio } from './Radio';

describe('Radio', () => {
  it('is a native radio that groups by name', async () => {
    render(
      <>
        <Radio name="g" aria-label="A" defaultChecked />
        <Radio name="g" aria-label="B" />
      </>,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(screen.getByRole('radio', { name: 'B' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'A' })).not.toBeChecked();
  });

  it('ignores clicks when disabled', async () => {
    const onChange = vi.fn<() => void>();
    render(<Radio aria-label="A" disabled onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
