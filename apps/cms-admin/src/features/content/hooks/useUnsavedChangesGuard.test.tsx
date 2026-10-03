import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { UnsavedChangesDialog } from '@/components/form/UnsavedChangesDialog';

import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

const Editor: React.FC = () => {
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedChangesGuard(dirty);
  const navigate = useNavigate();
  return (
    <div>
      <h1>Editor</h1>
      <label>
        Title
        <input onChange={() => setDirty(true)} />
      </label>
      <Link to="/elsewhere">Elsewhere</Link>
      <button
        type="button"
        onClick={() => {
          guard.bypass();
          navigate('/saved', { replace: true });
        }}
      >
        Save and leave
      </button>
      <UnsavedChangesDialog guard={guard} />
    </div>
  );
};

function renderGuarded() {
  const router = createMemoryRouter(
    [
      { path: '/start', element: <Link to="/editor">Open editor</Link> },
      { path: '/editor', element: <Editor /> },
      { path: '/elsewhere', element: <h1>Elsewhere page</h1> },
      { path: '/saved', element: <h1>Saved page</h1> },
    ],
    { initialEntries: ['/start', '/editor'], initialIndex: 1 },
  );
  const user = userEvent.setup();
  render(<RouterProvider router={router} />);
  return { router, user };
}

const DIALOG = 'Discard unsaved changes?';

describe('useUnsavedChangesGuard (AC-16, D10)', () => {
  it('leaves a clean form through a link without asking', async () => {
    const { user } = renderGuarded();

    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));

    expect(await screen.findByRole('heading', { name: 'Elsewhere page' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('asks before following a link from a dirty form, and Cancel keeps the edits', async () => {
    const { user, router } = renderGuarded();
    await user.type(screen.getByLabelText('Title'), 'Draft');

    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));

    const dialog = await screen.findByRole('alertdialog', { name: DIALOG });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(dialog).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/editor');
    expect(screen.getByLabelText('Title')).toHaveValue('Draft');
  });

  it('leaves a dirty form on Discard', async () => {
    const { user } = renderGuarded();
    await user.type(screen.getByLabelText('Title'), 'Draft');

    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    expect(await screen.findByRole('heading', { name: 'Elsewhere page' })).toBeInTheDocument();
  });

  it('asks on Back from a dirty form', async () => {
    const { user, router } = renderGuarded();
    await user.type(screen.getByLabelText('Title'), 'Draft');

    await act(() => router.navigate(-1));

    expect(await screen.findByRole('alertdialog', { name: DIALOG })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(await screen.findByRole('link', { name: 'Open editor' })).toBeInTheDocument();
  });

  it('lets the navigation after a save through with bypass()', async () => {
    const { user } = renderGuarded();
    await user.type(screen.getByLabelText('Title'), 'Draft');

    await user.click(screen.getByRole('button', { name: 'Save and leave' }));

    expect(await screen.findByRole('heading', { name: 'Saved page' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('arms beforeunload only while the form is dirty', async () => {
    const { user } = renderGuarded();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText('Title'), 'Draft');

    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('disarms beforeunload when the page unmounts', async () => {
    const { user } = renderGuarded();
    await user.type(screen.getByLabelText('Title'), 'Draft');
    await user.click(screen.getByRole('button', { name: 'Save and leave' }));
    await screen.findByRole('heading', { name: 'Saved page' });

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
