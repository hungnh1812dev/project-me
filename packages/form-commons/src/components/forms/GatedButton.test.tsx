import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GatedButton } from './GatedButton';

const ALLOW = { allowed: true, reason: null };
const DENY = { allowed: false, reason: 'Requires the "role:manager" permission.' };

describe('GatedButton', () => {
  it('acts as a normal button when the decision is allowed', async () => {
    const onClick = vi.fn();
    render(
      <GatedButton decision={ALLOW} onClick={onClick}>
        New role
      </GatedButton>,
    );
    const button = screen.getByRole('button', { name: 'New role' });

    expect(button).not.toHaveAttribute('aria-disabled');
    expect(button).not.toHaveAttribute('aria-describedby');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is aria-disabled but focusable, and exposes the reason when denied', async () => {
    render(<GatedButton decision={DENY}>New role</GatedButton>);
    const button = screen.getByRole('button', { name: 'New role' });

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAccessibleDescription('Requires the "role:manager" permission.');

    await userEvent.tab();
    expect(button).toHaveFocus();
  });

  it('shows the reason in a tooltip on hover when denied', async () => {
    render(<GatedButton decision={DENY}>New role</GatedButton>);

    await userEvent.hover(screen.getByRole('button', { name: 'New role' }));

    await waitFor(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        'Requires the "role:manager" permission.',
      ),
    );
  });

  it('ignores clicks, Enter and form submission when denied', async () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <GatedButton decision={DENY} type="submit" onClick={onClick}>
          Save
        </GatedButton>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'Save' });

    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}');

    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps an existing aria-describedby next to the reason', () => {
    render(
      <>
        <p id="hint">Hint</p>
        <GatedButton decision={DENY} aria-describedby="hint">
          Delete
        </GatedButton>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAccessibleDescription(
      `Hint ${DENY.reason}`,
    );
  });

  it('falls back to a generic reason when a denial has none', () => {
    render(<GatedButton decision={{ allowed: false, reason: null }}>Delete</GatedButton>);

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAccessibleDescription(
      "You don't have permission to do this.",
    );
  });

  it('shows its tooltip on hover and focus when allowed, without changing the name', async () => {
    render(
      <GatedButton decision={ALLOW} tooltip="Choose Cover image" aria-label="Choose Cover image">
        <svg aria-hidden="true" />
      </GatedButton>,
    );
    const button = screen.getByRole('button', { name: 'Choose Cover image' });

    expect(button).not.toHaveAttribute('aria-disabled');
    await userEvent.tab();
    expect(button).toHaveFocus();
    await waitFor(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        'Choose Cover image',
      ),
    );
  });

  it('still activates when allowed with a tooltip', async () => {
    const onClick = vi.fn();
    render(
      <GatedButton decision={ALLOW} tooltip="Remove" aria-label="Remove" onClick={onClick}>
        <svg aria-hidden="true" />
      </GatedButton>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the denial reason, not the tooltip, when denied', async () => {
    render(
      <GatedButton decision={DENY} tooltip="Choose Cover image" aria-label="Choose Cover image">
        <svg aria-hidden="true" />
      </GatedButton>,
    );
    const button = screen.getByRole('button', { name: 'Choose Cover image' });

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(DENY.reason);
    await userEvent.hover(button);
    await waitFor(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        DENY.reason,
      ),
    );
  });
});
