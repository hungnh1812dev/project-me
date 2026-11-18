import { EN_TEXT } from '@configs/locales/en';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';

import { LeaveGuardProvider, useGuardedLinkClick, useLeaveGuard } from './LeaveGuard';

const text = EN_TEXT.common.leaveDialog;

function GuardedPage({ hasUnsavedWork }: { hasUnsavedWork: boolean }) {
  useLeaveGuard(hasUnsavedWork);
  const handleClick = useGuardedLinkClick();
  return (
    <Link to="/other" onClick={(event) => handleClick(event, '/other')}>
      Go elsewhere
    </Link>
  );
}

function renderPage(hasUnsavedWork: boolean) {
  return render(
    <MemoryRouter>
      <LeaveGuardProvider>
        <Routes>
          <Route path="/" element={<GuardedPage hasUnsavedWork={hasUnsavedWork} />} />
          <Route path="/other" element={<p>Other page</p>} />
        </Routes>
      </LeaveGuardProvider>
    </MemoryRouter>,
  );
}

const link = () => screen.getByRole('link', { name: 'Go elsewhere' });

describe('LeaveGuard', () => {
  it('navigates at once with no registered page', async () => {
    renderPage(false);
    await userEvent.click(link());
    expect(screen.getByText('Other page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks first while a page holds unsaved work, and stay keeps the page', async () => {
    renderPage(true);
    await userEvent.click(link());
    expect(await screen.findByRole('dialog', { name: text.title })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: text.stay }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(link()).toBeInTheDocument();
    expect(screen.queryByText('Other page')).not.toBeInTheDocument();
  });

  it('navigates when the user chooses to leave', async () => {
    renderPage(true);
    await userEvent.click(link());
    await userEvent.click(await screen.findByRole('button', { name: text.leave }));
    expect(await screen.findByText('Other page')).toBeInTheDocument();
  });

  it('stops asking once the unsaved work is gone', async () => {
    const view = renderPage(true);
    view.unmount();
    renderPage(false);
    await userEvent.click(link());
    expect(screen.getByText('Other page')).toBeInTheDocument();
  });

  it('adds the beforeunload listener while guarded and removes it after', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = renderPage(true);
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    view.unmount();
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    add.mockRestore();
    remove.mockRestore();
  });

  it('adds no beforeunload listener with nothing to lose', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderPage(false);
    expect(add).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
    add.mockRestore();
  });
});
