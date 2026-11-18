import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('names the button by its label and forwards variant and type', () => {
    render(
      <IconButton label="Remove from field" variant="destructive" type="button">
        <svg />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Remove from field' });
    expect(button).toHaveAttribute('data-size', 'icon');
    expect(button).toHaveAttribute('data-variant', 'destructive');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('shows the label as a tooltip on keyboard focus', async () => {
    render(
      <IconButton label="Replace file">
        <svg />
      </IconButton>,
    );
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Replace file');
  });

  it('calls onClick when enabled', async () => {
    const onClick = vi.fn<() => void>();
    render(
      <IconButton label="Go" onClick={onClick}>
        <svg />
      </IconButton>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled: no click, but the wrapper takes focus and shows the tooltip', async () => {
    const onClick = vi.fn<() => void>();
    render(
      <IconButton label="Replace file" disabled onClick={onClick}>
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeDisabled();
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Replace file');
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton styling hooks', () => {
  it('shares the Button radius and focus classes', () => {
    render(
      <IconButton label="Go">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(
      'rounded-control',
      'focus-visible:outline-focus-edge',
    );
  });

  it('the disabled wrapper takes the same focus classes', () => {
    render(
      <IconButton label="Go" disabled>
        <svg />
      </IconButton>,
    );
    const wrapper = document.querySelector('[data-slot="icon-button-wrapper"]');
    expect(wrapper).toHaveClass('rounded-control', 'focus-visible:outline-focus-edge');
  });
});
