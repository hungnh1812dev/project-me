import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { COPY } from '../../config/copy.constants';
import { REVIEWER_OTHER_VALUE } from '../../config/reviewer.constants';
import { fakeApi, httpError, Wrapper } from '../session/session-test-utils';
import { useWebSession } from '../session';
import { ReviewerAccessDialog } from './ReviewerAccessDialog';
import { toSessionInput, type ReviewerFormValues } from './reviewer-form';
import type { AuthApi } from '../session/auth.api';
import type { ReviewerApi } from './reviewer.api';

// The real widget loads Cloudflare's script; tests stand in for it.
vi.mock('./TurnstileWidget', () => ({
  TurnstileWidget: ({
    onToken,
    onExpired,
  }: {
    onToken: (token: string) => void;
    onExpired: () => void;
  }) => (
    <>
      <button type="button" onClick={() => onToken('cf-token')}>
        pass check
      </button>
      <button type="button" onClick={onExpired}>
        expire check
      </button>
    </>
  ),
}));

// Radix checkboxes measure themselves; jsdom has no ResizeObserver.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const copy = COPY.reviewer;

function SessionProbe() {
  const { status, kind, getAccessToken } = useWebSession();
  return (
    <p data-testid="probe">{`${status}/${kind ?? '-'}/${getAccessToken() ?? '-'}`}</p>
  );
}

function setup(createSession: ReviewerApi['createSession']) {
  const reviewerApi: ReviewerApi = {
    isEnabled: vi.fn<ReviewerApi['isEnabled']>().mockResolvedValue(true),
    createSession,
  };
  const auth = fakeApi({
    me: vi.fn<AuthApi['me']>().mockResolvedValue({
      id: 'rev-1',
      email: 'reviewer-1@reviewer.invalid',
      displayName: 'Reviewer',
      role: 'reviewer',
      permissions: ['article:read'],
    }),
  });
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const user = userEvent.setup();
  render(
    <Wrapper api={auth}>
      <SessionProbe />
      <ReviewerAccessDialog
        open
        onOpenChange={onOpenChange}
        siteKey="site-key"
        api={reviewerApi}
      />
    </Wrapper>,
  );
  return { user, auth, createSession, onOpenChange };
}

async function chooseRole(
  user: ReturnType<typeof userEvent.setup>,
  value: string,
) {
  await user.selectOptions(
    screen.getByLabelText(new RegExp(copy.role.label)),
    value,
  );
}

describe('reviewer access dialog', () => {
  it('asks for a role before moving on', async () => {
    const { user } = setup(vi.fn<ReviewerApi['createSession']>());
    await user.click(screen.getByRole('button', { name: copy.next }));
    expect(
      await screen.findByText(copy.validation.roleRequired),
    ).toBeInTheDocument();
    expect(
      screen.getByText(copy.stepLabel(1, 3), { exact: false }),
    ).toBeVisible();
  });

  it('requires a description for Other roles and Other purposes', async () => {
    const { user } = setup(vi.fn<ReviewerApi['createSession']>());
    await chooseRole(user, REVIEWER_OTHER_VALUE);
    await user.click(screen.getByRole('button', { name: copy.next }));
    expect(
      await screen.findByText(copy.validation.roleOtherRequired),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(copy.role.otherLabel), 'Auditor');
    await user.click(screen.getByRole('button', { name: copy.next }));
    await user.click(screen.getByLabelText(copy.purposes.other));
    await user.click(screen.getByRole('button', { name: copy.next }));
    expect(
      await screen.findByText(copy.validation.purposeOtherRequired),
    ).toBeInTheDocument();
  });

  it('moves on with Enter on step 2 when both Other fields are open', async () => {
    const { user } = setup(vi.fn<ReviewerApi['createSession']>());
    await chooseRole(user, REVIEWER_OTHER_VALUE);
    await user.type(screen.getByLabelText(copy.role.otherLabel), 'Auditor');
    await user.click(screen.getByRole('button', { name: copy.next }));
    await user.click(screen.getByLabelText(copy.purposes.other));
    await user.type(
      screen.getByLabelText(copy.purposes.otherLabel),
      'Due diligence{Enter}',
    );
    expect(
      await screen.findByText(copy.stepLabel(3, 3), { exact: false }),
    ).toBeVisible();
  });

  it('blocks submit until the verification check passes', async () => {
    const createSession = vi.fn<ReviewerApi['createSession']>();
    const { user } = setup(createSession);
    await chooseRole(user, 'Recruiter');
    await user.click(screen.getByRole('button', { name: copy.next }));
    await user.click(screen.getByRole('button', { name: copy.next }));
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(
      await screen.findByText(copy.turnstile.required),
    ).toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('starts a session with the answers and holds the token in the session', async () => {
    const createSession = vi
      .fn<ReviewerApi['createSession']>()
      .mockResolvedValue({
        accessToken: 'rev-token',
        expiresAt: '2026-10-23T00:00:00Z',
      });
    const { user, auth, onOpenChange } = setup(createSession);
    await chooseRole(user, 'Recruiter');
    await user.click(screen.getByRole('button', { name: copy.next }));
    await user.click(screen.getByLabelText('Hiring'));
    await user.click(screen.getByRole('button', { name: copy.next }));
    await user.type(
      screen.getByLabelText(new RegExp(copy.notes.label)),
      ' Looking at the CV ',
    );
    await user.click(screen.getByRole('button', { name: 'pass check' }));
    await user.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent(
        'authenticated/reviewer/rev-token',
      ),
    );
    expect(createSession).toHaveBeenCalledWith({
      visitorRole: 'Recruiter',
      purposeTags: ['Hiring'],
      notes: 'Looking at the CV',
      turnstileToken: 'cf-token',
    });
    expect(auth.me).toHaveBeenCalledWith('rev-token');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the retry time when the address is limited, and asks for a new check', async () => {
    const createSession = vi
      .fn<ReviewerApi['createSession']>()
      .mockRejectedValue(
        httpError(
          429,
          { errorCode: 'REVIEWER_IP_LIMITED' },
          { 'retry-after': '300' },
        ),
      );
    const { user } = setup(createSession);
    await chooseRole(user, 'Recruiter');
    await user.click(screen.getByRole('button', { name: copy.next }));
    await user.click(screen.getByRole('button', { name: copy.next }));
    await user.click(screen.getByRole('button', { name: 'pass check' }));
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(
      await screen.findByText(copy.errors.ipLimitedMinutes(5)),
    ).toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveTextContent('anonymous/-/-');
    // The spent token is gone: submitting again needs a new check.
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(
      await screen.findByText(copy.turnstile.required),
    ).toBeInTheDocument();
  });

  it('explains a disabled switch', async () => {
    const createSession = vi
      .fn<ReviewerApi['createSession']>()
      .mockRejectedValue(httpError(403, { errorCode: 'REVIEWER_DISABLED' }));
    const { user } = setup(createSession);
    await chooseRole(user, 'Recruiter');
    await user.click(screen.getByRole('button', { name: copy.next }));
    await user.click(screen.getByRole('button', { name: copy.next }));
    await user.click(screen.getByRole('button', { name: 'pass check' }));
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(await screen.findByText(copy.errors.disabled)).toBeInTheDocument();
  });
});

describe('toSessionInput', () => {
  const base: ReviewerFormValues = {
    role: 'Recruiter',
    roleOther: '',
    purposeChecks: [true, false, true],
    purposeOtherChecked: false,
    purposeOther: '',
    notes: '  ',
  };

  it('maps presets, trims and omits empty notes', () => {
    expect(toSessionInput(base)).toEqual({
      visitorRole: 'Recruiter',
      purposeTags: ['Hiring', 'Networking'],
    });
  });

  it('uses the free text for Other', () => {
    expect(
      toSessionInput({
        ...base,
        role: REVIEWER_OTHER_VALUE,
        roleOther: ' Auditor ',
        purposeChecks: [false, false, false],
        purposeOtherChecked: true,
        purposeOther: ' Due diligence ',
      }),
    ).toEqual({ visitorRole: 'Auditor', purposeTags: ['Due diligence'] });
  });
});
