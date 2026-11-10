import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './Dialog';
import { ToastProvider, useToast, type ToastOptions } from './Toast';

const labels = { region: 'Notifications', close: 'Close notification' };

function Trigger({ options }: { options: ToastOptions }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(options)}>fire</button>;
}

function renderToast(options: ToastOptions) {
  render(
    <ToastProvider labels={labels}>
      <Trigger options={options} />
    </ToastProvider>,
  );
}

const fire = () =>
  act(() => {
    screen.getByRole('button', { name: 'fire' }).click();
  });

describe('Toast', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ['success', 'polite'],
    ['info', 'polite'],
    ['warning', 'assertive'],
    ['error', 'assertive'],
  ] as const)('renders a %s toast with an icon and %s announcement', async (tone, politeness) => {
    renderToast({ tone, title: 'Saved', description: 'All good' });
    fire();
    const toast = document.querySelector(`[data-slot="toast"][data-tone="${tone}"]`);
    expect(toast).toBeInTheDocument();
    expect(toast?.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector(`span[role="status"][aria-live="${politeness}"]`),
      ).toHaveTextContent('Saved'),
    );
  });

  it('exposes the region label and a labelled close button', () => {
    renderToast({ tone: 'info', title: 'Hello' });
    fire();
    expect(screen.getByRole('region', { name: /^Notifications/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close notification' })).toBeInTheDocument();
  });

  it.each([
    ['success', 4000],
    ['info', 4000],
    ['warning', 5000],
    ['error', 5000],
  ] as const)('closes a %s toast after %i ms', (tone, durationMs) => {
    vi.useFakeTimers();
    renderToast({ tone, title: 'Timed' });
    fire();
    act(() => {
      vi.advanceTimersByTime(durationMs - 100);
    });
    expect(screen.getByText('Timed', { selector: '[data-slot="toast"] *' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelector('[data-slot="toast"]')).not.toBeInTheDocument();
  });

  it('pauses the timer while hovered', () => {
    vi.useFakeTimers();
    renderToast({ tone: 'success', title: 'Held' });
    fire();
    const toast = document.querySelector('[data-slot="toast"]') as HTMLElement;
    act(() => {
      toast.dispatchEvent(new Event('pointermove', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(document.querySelector('[data-slot="toast"]')).toBeInTheDocument();
  });

  it('pauses the timer while a toast has keyboard focus', () => {
    vi.useFakeTimers();
    renderToast({ tone: 'success', title: 'Focused' });
    fire();
    act(() => {
      (document.querySelector('[data-slot="toast"]') as HTMLElement).focus();
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(document.querySelector('[data-slot="toast"]')).toBeInTheDocument();
  });

  it('closes on the close button', async () => {
    renderToast({ tone: 'info', title: 'Bye' });
    fire();
    await userEvent.click(screen.getByRole('button', { name: 'Close notification' }));
    expect(document.querySelector('[data-slot="toast"]')).not.toBeInTheDocument();
  });

  it('closes the focused toast on Escape', async () => {
    renderToast({ tone: 'info', title: 'Esc' });
    fire();
    act(() => {
      (document.querySelector('[data-slot="toast"]') as HTMLElement).focus();
    });
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('[data-slot="toast"]')).not.toBeInTheDocument();
  });

  it('closes an open dialog on Escape and keeps the toast', async () => {
    const onOpenChange = vi.fn();
    render(
      <ToastProvider labels={labels}>
        <Trigger options={{ tone: 'success', title: 'Saved' }} />
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>Edit</DialogTitle>
            <DialogDescription>Edit it</DialogDescription>
            <DialogClose>Cancel</DialogClose>
          </DialogContent>
        </Dialog>
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: 'fire', hidden: true }).click();
    });
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.querySelector('[data-slot="toast"]')).toBeInTheDocument();
  });

  it('replaces a toast shown with the same key', () => {
    renderToast({ tone: 'info', title: 'Same', key: 'k' });
    fire();
    fire();
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(1);
  });

  it('shows at most 3 toasts and drops the oldest', () => {
    vi.useFakeTimers();
    renderToast({ tone: 'info', title: 'Many' });
    for (let i = 0; i < 4; i += 1) fire();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(3);
  });

  it('throws when useToast is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger options={{ tone: 'info', title: 'x' }} />)).toThrow(
      /ToastProvider/,
    );
    spy.mockRestore();
  });
});
