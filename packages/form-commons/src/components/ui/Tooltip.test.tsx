import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tooltip, TOOLTIP_DELAY_MS, TooltipContent, TooltipTrigger } from './Tooltip';

function renderTooltip() {
  render(
    <Tooltip>
      <TooltipTrigger>Info</TooltipTrigger>
      <TooltipContent>Helpful text</TooltipContent>
    </Tooltip>,
  );
}

describe('Tooltip', () => {
  it('uses a 700 ms delay', () => {
    expect(TOOLTIP_DELAY_MS).toBe(700);
  });

  it('opens after the hover delay, not immediately', async () => {
    renderTooltip();
    await userEvent.hover(screen.getByRole('button', { name: 'Info' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Helpful text');
  });

  it('opens on keyboard focus and closes on Escape', async () => {
    renderTooltip();
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
