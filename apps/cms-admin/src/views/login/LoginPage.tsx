import { useCallback, useState } from 'react';
import {
  Button,
  CheckboxInput,
  FormAlert,
  TextInput,
  type FormAlertTone,
} from '@abyss/form-commons';
import { AuthPageLayout } from '@components/layouts/AuthPageLayout';
import { APP_ROUTES } from '@configs/App.routes';
import { useScreenText, type ScreenText } from '@configs/locales';
import type { TwoFactorChallenge } from '@features/auth/Auth.api';
import { selectEndNotice, selectSessionStatus } from '@features/auth/Auth.slice';
import { toLoginError, type LoginError } from '@features/auth/Login.errors';
import { loginEmailOf, loginNoticeOf, type LoginNotice } from '@features/auth/LoginNotice.rules';
import type { LoginLocationState } from '@features/auth/ProtectedRoute';
import { useSession } from '@features/auth/Session.context';
import { SessionLoading } from '@features/auth/SessionLoading';
import { useAuthSelector } from '@features/auth/useAuthSelector';
import { useSetupStatus } from '@features/auth/useSetupStatus';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { Link, Navigate, useLocation } from 'react-router';
import { z } from 'zod';

import { TwoFactorModal } from './TwoFactorModal';

type LoginCopy = ScreenText<'login'>['login'];

const loginSchemaOf = (copy: LoginCopy) =>
  z.object({
    email: z
      .string()
      .trim()
      .min(1, copy.validation.emailRequired)
      .pipe(z.email(copy.validation.emailInvalid)),
    password: z.string().min(1, copy.validation.passwordRequired),
    rememberMe: z.boolean(),
  });

type LoginValues = z.input<ReturnType<typeof loginSchemaOf>>;

const ALERT_TONE: Record<LoginError['kind'], string> = {
  'invalid-credentials': 'bg-destructive-soft text-destructive-strong',
  'rate-limited': 'bg-warning-soft text-warning-strong',
  network: 'bg-warning-soft text-warning-strong',
  unexpected: 'bg-destructive-soft text-destructive-strong',
};

const noticeCopyOf = (copy: LoginCopy): Record<LoginNotice, string> => ({
  'password-reset': copy.notices.passwordReset,
  'password-set': copy.notices.passwordSet,
  'password-changed': copy.notices.passwordChanged,
  'owner-created': copy.notices.ownerCreated,
  'setup-complete': copy.notices.setupComplete,
});

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
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
    ? from
    : APP_ROUTES.HOME;
}

export function LoginPage() {
  const text = useScreenText('login');
  const copy = text.login;
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
    resolver: zodResolver(loginSchemaOf(copy)),
    defaultValues: { email: loginEmailOf(location.state), password: '', rememberMe: false },
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
      setError(toLoginError(cause, text));
      form.resetField('password');
      form.resetField('rememberMe');
      form.setFocus('password');
    },
  });

  const closeChallenge = useCallback(() => {
    setChallenge(null);
    form.resetField('rememberMe');
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
    signIn.mutate({
      email: values.email.trim(),
      password: values.password,
      rememberMe: values.rememberMe,
    });
  });

  return (
    <AuthPageLayout>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
      {isSetupOpen ? (
        <div className="mt-6 grid gap-3">
          <FormAlert tone="info">{copy.setupPrompt.message}</FormAlert>
          <div>
            <Button asChild variant="secondary">
              <Link to={APP_ROUTES.SETUP}>{copy.setupPrompt.action}</Link>
            </Button>
          </div>
        </div>
      ) : null}
      <FormProvider {...form}>
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="mt-6 grid gap-4">
          {notice !== undefined ? (
            <FormAlert tone={NOTICE_TONE[notice]}>{noticeCopyOf(copy)[notice]}</FormAlert>
          ) : null}
          {challengeExpired ? <FormAlert tone="info">{copy.twoFactor.expired}</FormAlert> : null}
          {error !== null ? (
            <p role="alert" className={`rounded-md px-3 py-2 text-sm ${ALERT_TONE[error.kind]}`}>
              {error.message}
            </p>
          ) : null}
          <TextInput<LoginValues>
            name="email"
            label={copy.emailLabel}
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            required
          />
          <TextInput<LoginValues>
            name="password"
            label={copy.passwordLabel}
            type="password"
            autoComplete="current-password"
            required
          />
          <CheckboxInput<LoginValues>
            name="rememberMe"
            label={copy.rememberMe}
            description={copy.rememberMeHint}
          />
          <Button
            type="submit"
            variant="primary"
            className="mt-2 w-full"
            loading={signIn.isPending}
          >
            {copy.submit}
          </Button>
        </form>
      </FormProvider>
      <p className="mt-4">
        <Button asChild variant="link" className="h-auto px-0">
          <Link to={APP_ROUTES.RESET_PASSWORD}>{copy.forgotPassword}</Link>
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
