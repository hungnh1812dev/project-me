import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { EN_TEXT } from '@configs/locales/en';
import type { CurrentUser } from '@features/auth/Auth.slice';
import { createTestServices, renderApp, renderInApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LeaveGuardProvider, useLeaveGuard } from './LeaveGuard';
import { initialsOf, UserMenu } from './UserMenu';

const { REFRESH, LOGOUT, ME } = API_ENDPOINTS.AUTH;
const session = EN_TEXT.session;

async function open(user: CurrentUser = TEST_USER) {
  const harness = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: user }),
    [`POST ${LOGOUT}`]: () => ({ status: 204 }),
  });
  await harness.services.session.restore();
  renderApp(harness.services);
  const trigger = await screen.findByRole('button', {
    name: session.accountMenu(user.displayName),
  });
  return { ...harness, trigger };
}

describe('initialsOf', () => {
  it.each([
    ['Mai Tran', 'MT'],
    ['mai', 'M'],
    ['  mai   van   tran ', 'MT'],
    ['', 'O'],
    ['   ', 'O'],
    ['😀 Mai', '😀M'],
    ['😀', '😀'],
    ['Mai Tran Nguyen Van Anh Thu Minh Quang Long Hai Duong', 'MD'],
  ])('reads %j as %j', (name, expected) => {
    expect(initialsOf(name, 'owner@domain.localhost')).toBe(expected);
  });
});

describe('UserMenu', () => {
  it('shows the owner the account header and four actions', async () => {
    const { trigger } = await open();
    expect(trigger).toHaveTextContent('MT');

    await userEvent.click(trigger);

    expect(screen.getByText(TEST_USER.displayName)).toBeInTheDocument();
    expect(screen.getByText(TEST_USER.email)).toBeInTheDocument();
    expect(screen.getByText(TEST_USER.role)).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      session.profileLink,
      session.changePasswordLink,
      session.securityLink,
      session.signOut,
    ]);
  });

  it('shows a reviewer Profile and Sign out only', async () => {
    const { trigger } = await open({ ...TEST_USER, role: 'reviewer' });
    await userEvent.click(trigger);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      session.profileLink,
      session.signOut,
    ]);
  });

  it('opens from the keyboard and closes on Escape', async () => {
    const { trigger } = await open();
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('signs out once', async () => {
    const { api, trigger } = await open();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: session.signOut }));

    expect(
      await screen.findByRole('heading', { level: 1, name: EN_TEXT.login.title }),
    ).toBeVisible();
    expect(api.callsTo(`POST ${LOGOUT}`)).toHaveLength(1);
  });

  describe('with a page holding unsaved work', () => {
    function UnsavedPage() {
      useLeaveGuard(true);
      return <UserMenu />;
    }

    async function openGuarded() {
      const harness = createTestServices({
        [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
        [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
        [`POST ${LOGOUT}`]: () => ({ status: 204 }),
      });
      await harness.services.session.restore();
      renderInApp(
        harness.services,
        <LeaveGuardProvider>
          <UnsavedPage />
        </LeaveGuardProvider>,
      );
      await userEvent.click(
        await screen.findByRole('button', { name: session.accountMenu(TEST_USER.displayName) }),
      );
      await userEvent.click(screen.getByRole('menuitem', { name: session.signOut }));
      return harness;
    }

    it('keeps the session when the user stays', async () => {
      const { api } = await openGuarded();
      await userEvent.click(
        await screen.findByRole('button', { name: EN_TEXT.common.leaveDialog.stay }),
      );
      expect(api.callsTo(`POST ${LOGOUT}`)).toHaveLength(0);
    });

    it('signs out when the user leaves', async () => {
      const { api } = await openGuarded();
      await userEvent.click(
        await screen.findByRole('button', { name: EN_TEXT.common.leaveDialog.leave }),
      );
      await vi.waitFor(() => expect(api.callsTo(`POST ${LOGOUT}`)).toHaveLength(1));
    });
  });
});
