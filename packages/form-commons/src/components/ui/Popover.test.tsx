import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Popover, PopoverContent, PopoverTrigger } from './Popover';

describe('Popover', () => {
  it('opens from the trigger and closes on Escape, returning focus', async () => {
    render(
      <Popover>
        <PopoverTrigger>Colours</PopoverTrigger>
        <PopoverContent>Palette</PopoverContent>
      </Popover>,
    );
    const trigger = screen.getByRole('button', { name: 'Colours' });
    await userEvent.click(trigger);
    expect(screen.getByText('Palette')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Palette')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
