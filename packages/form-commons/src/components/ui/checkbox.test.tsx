import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { Checkbox } from './checkbox';

function Controlled() {
  const [checked, setChecked] = useState(false);
  return (
    <Checkbox
      aria-label="Read"
      checked={checked}
      onCheckedChange={(value) => setChecked(value === true)}
    />
  );
}

describe('Checkbox', () => {
  it('toggles with click and Space', async () => {
    render(<Controlled />);
    const box = screen.getByRole('checkbox', { name: 'Read' });
    expect(box).not.toBeChecked();

    await userEvent.click(box);
    expect(box).toBeChecked();

    await userEvent.keyboard(' ');
    expect(box).not.toBeChecked();
  });

  it('reports the indeterminate state as mixed', () => {
    render(<Checkbox aria-label="Fields" checked="indeterminate" />);
    expect(screen.getByRole('checkbox', { name: 'Fields' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
  });

  it('cannot be toggled when disabled', async () => {
    const onCheckedChange = vi.fn<(value: boolean | 'indeterminate') => void>();
    render(
      <Checkbox
        aria-label="Delete"
        disabled
        onCheckedChange={onCheckedChange}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Delete' }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
