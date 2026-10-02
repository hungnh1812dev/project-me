import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SecretReveal } from './SecretReveal';

const SECRET = 'cms_secret_abc123';

function stubClipboard(writeText: (text: string) => Promise<void>) {
  const spy = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: spy }, configurable: true });
  return spy;
}

function setup(secret: string | null = SECRET) {
  const onDone = vi.fn();
  const view = render(<SecretReveal secret={secret} onDone={onDone} />);
  return { onDone, ...view };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SecretReveal (AC-34)', () => {
  it('is a modal alertdialog titled "Copy your token now" with the warning', async () => {
    setup();

    const dialog = await screen.findByRole('alertdialog', { name: 'Copy your token now' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription("You won't be able to see it again.");
  });

  it('shows the secret in a read-only monospace input labelled "Token"', async () => {
    setup();

    const input = await screen.findByRole('textbox', { name: 'Token' });

    expect(input).toHaveValue(SECRET);
    expect(input).toHaveAttribute('readonly');
    expect(input.className).toMatch(/font-mono/);
  });

  it('selects the whole secret when the input gets focus', async () => {
    setup();
    const input = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Token' });

    act(() => input.focus());

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(SECRET.length);
  });

  it('renders nothing while there is no secret', () => {
    setup(null);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('copies the secret, announces "Copied." and relabels the button for 2 s', async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    setup();
    await screen.findByRole('alertdialog');
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(screen.getByRole('status')).toHaveTextContent('Copied.');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('announces the fallback and selects the text when copying fails', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    setup();
    const input = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Token' });

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      "Couldn't copy. Select the token and copy it manually.",
    );
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(SECRET.length);
  });

  it('falls back when the clipboard API is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    setup();
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('status')).toHaveTextContent("Couldn't copy.");
  });

  it('does not close on Escape or an outside click', async () => {
    const { onDone } = setup();
    await screen.findByRole('alertdialog');

    await userEvent.keyboard('{Escape}');
    await userEvent.click(document.body);

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onDone from Done, and the secret leaves the DOM once cleared', async () => {
    const { onDone, rerender } = setup();
    await screen.findByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    rerender(<SecretReveal secret={null} onDone={onDone} />);

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it('moves focus to finalFocus on close', async () => {
    const onDone = vi.fn();
    const target = { current: null as HTMLButtonElement | null };
    const view = render(
      <>
        <button ref={(node) => void (target.current = node)}>New token</button>
        <SecretReveal secret={SECRET} onDone={onDone} finalFocus={target} />
      </>,
    );
    await screen.findByRole('alertdialog');

    view.rerender(
      <>
        <button ref={(node) => void (target.current = node)}>New token</button>
        <SecretReveal secret={null} onDone={onDone} finalFocus={target} />
      </>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'New token' })).toHaveFocus());
  });
});
