import {
  Button,
  TextInput,
  FormAlert,
  type FormAlertTone,
} from '@abyss/form-commons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Link, Navigate, useLocation } from 'react-router';
import { z } from 'zod';

import { COPY } from '../../config/Copy.constants';
import { APP_ROUTES } from '../../config/App.routes';
import type { TwoFactorChallenge } from './Auth.api';
import { selectEndNotice, selectSessionStatus } from './Auth.slice';
import { useAuthSelector } from './useAuthSelector.state';
import { AuthPageLayout } from './AuthPageLayout';
import { type LoginError, toLoginError } from './LoginError.errors';
import {
  type LoginNotice,
  loginEmailOf,
  loginNoticeOf,
} from './LoginNotice.rules';
import type { LoginLocationState } from './ProtectedRoute';
import { useSession } from './Session.context';
import { SessionLoading } from './SessionLoading';
import { TwoFactorModal } from './TwoFactorModal';
import { useSetupStatus } from './useSetupStatus.query';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, COPY.login.validation.emailRequired)
    .pipe(z.email(COPY.login.validation.emailInvalid)),
  password: z.string().min(1, COPY.login.validation.passwordRequired),
});

type LoginValues = z.input<typeof loginSchema>;

const ALERT_TONE: Record<LoginError['kind'], string> = {
  'invalid-credentials': 'bg-destructive-soft text-destructive-strong',
  'rate-limited': 'bg-warning-soft text-warning-strong',
  network: 'bg-warning-soft text-warning-strong',
  unexpected: 'bg-destructive-soft text-destructive-strong',
};

const NOTICE_COPY: Record<LoginNotice, string> = {
  'password-reset': COPY.login.notices.passwordReset,
  'password-set': COPY.login.notices.passwordSet,
  'password-changed': COPY.login.notices.passwordChanged,
  'owner-created': COPY.login.notices.ownerCreated,
  'setup-complete': COPY.login.notices.setupComplete,
};

const NOTICE_TONE: Record<LoginNotice, FormAlertTone> = {
  'password-reset': 'success',
  'password-set': 'success',
  'password-changed': 'success',
  'owner-created': 'success',
  'setup-complete': 'info',
};

/** Only same-app paths, so router state can never redirect off-site. */
function returnPathOf(state: unknown): string {
  const from = (state as LoginLocationState | null)?.from;
  return typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//')
    ? from
    : APP_ROUTES.HOME;
}

export function LoginPage() {
  const status = useAuthSelector(selectSessionStatus);
  const endNotice = useAuthSelector(selectEndNotice);
  const location = useLocation();
  const session = useSession();
  // A failed status call shows nothing extra: setup is never the default.
  const isSetupOpen = useSetupStatus().data?.open === true;
  const [error, setError] = useState<LoginError | null>(null);
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const [challengeExpired, setChallengeExpired] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: loginEmailOf(location.state), password: '' },
    mode: 'onTouched',
  });

  const signIn = useMutation({
    mutationFn: session.signIn,
    onSuccess: (outcome) => {
      // A signed-in outcome re-renders into <Navigate> below.
      if (outcome.kind === 'two-factor-required') {
        form.resetField('password');
        setChallenge({
          tempToken: outcome.tempToken,
          methods: outcome.methods,
        });
      }
    },
    onError: (cause) => {
      setError(toLoginError(cause));
      form.resetField('password');
      form.setFocus('password');
    },
  });

  const closeChallenge = useCallback(() => {
    setChallenge(null);
    form.setFocus('password');
  }, [form]);
  const expireChallenge = useCallback(() => {
    setChallengeExpired(true);
    closeChallenge();
  }, [closeChallenge]);

  if (status === 'unknown') return <SessionLoading />;
  if (status === 'authenticated') {
    return <Navigate to={returnPathOf(location.state)} replace />;
  }

  // Hidden once the user tries to sign in, so it never sits next to an error.
  const notice = signIn.isIdle
    ? (loginNoticeOf(location.state) ?? endNotice ?? undefined)
    : undefined;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    setChallengeExpired(false);
    signIn.mutate({ email: values.email.trim(), password: values.password });
  });

  return (
    <AuthPageLayout>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {COPY.login.title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {COPY.login.description}
      </p>
      {isSetupOpen ? (
        <div className="mt-6 grid gap-3">
          <FormAlert tone="info">{COPY.login.setupPrompt.message}</FormAlert>
          <div>
            <Button asChild variant="secondary">
              <Link to={APP_ROUTES.SETUP}>{COPY.login.setupPrompt.action}</Link>
            </Button>
          </div>
        </div>
      ) : null}
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="mt-6 grid gap-4 rounded-md border border-border bg-card p-5"
        >
          {notice !== undefined ? (
            <FormAlert tone={NOTICE_TONE[notice]}>
              {NOTICE_COPY[notice]}
            </FormAlert>
          ) : null}
          {challengeExpired ? (
            <FormAlert tone="info">{COPY.login.twoFactor.expired}</FormAlert>
          ) : null}
          {error !== null ? (
            <p
              role="alert"
              className={`rounded-md px-3 py-2 text-sm ${ALERT_TONE[error.kind]}`}
            >
              {error.message}
            </p>
          ) : null}
          <TextInput<LoginValues>
            name="email"
            label={COPY.login.emailLabel}
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            required
          />
          <TextInput<LoginValues>
            name="password"
            label={COPY.login.passwordLabel}
            type="password"
            autoComplete="current-password"
            required
          />
          <Button
            type="submit"
            variant="primary"
            className="mt-2 w-full"
            loading={signIn.isPending}
          >
            {COPY.login.submit}
          </Button>
        </form>
      </FormProvider>
      <p className="mt-4">
        <Button asChild variant="link" className="h-auto px-0">
          <Link to={APP_ROUTES.RESET_PASSWORD}>
            {COPY.login.forgotPassword}
          </Link>
        </Button>
      </p>
      {challenge !== null ? (
        <TwoFactorModal
          challenge={challenge}
          onCancel={closeChallenge}
          onExpired={expireChallenge}
        />
      ) : null}
    </AuthPageLayout>
  );
}
