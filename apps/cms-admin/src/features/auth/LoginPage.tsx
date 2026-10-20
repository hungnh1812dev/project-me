import { Button, TextInput } from '@abyss/form-commons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router';
import { z } from 'zod';

import { useAppSelector } from '../../app/store';
import { COPY } from '../../config/copy.constants';
import { APP_ROUTES } from '../../config/routes';
import { selectSessionStatus } from './auth.slice';
import { type LoginError, toLoginError } from './login-error';
import type { LoginLocationState } from './ProtectedRoute';
import { useSession } from './session-context';
import { SessionLoading } from './SessionLoading';

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
  const status = useAppSelector(selectSessionStatus);
  const location = useLocation();
  const session = useSession();
  const [error, setError] = useState<LoginError | null>(null);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const signIn = useMutation({
    mutationFn: session.signIn,
    onSuccess: (outcome) => {
      // A signed-in outcome re-renders into <Navigate> below.
      if (outcome.kind === 'two-factor-required') {
        form.resetField('password');
        setTwoFactorRequired(true);
      }
    },
    onError: (cause) => {
      setError(toLoginError(cause));
      form.resetField('password');
      form.setFocus('password');
    },
  });

  if (status === 'unknown') return <SessionLoading />;
  if (status === 'authenticated') {
    return <Navigate to={returnPathOf(location.state)} replace />;
  }

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    signIn.mutate({ email: values.email.trim(), password: values.password });
  });

  return (
    <div className="min-h-dvh px-4 py-12 sm:py-20">
      <main className="mx-auto w-full max-w-sm">
        <p className="text-sm font-semibold">{COPY.app.name}</p>
        {twoFactorRequired ? (
          <TwoFactorPlaceholder
            onBack={() => {
              setTwoFactorRequired(false);
              signIn.reset();
            }}
          />
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">
              {COPY.login.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {COPY.login.description}
            </p>
            <FormProvider {...form}>
              <form
                noValidate
                onSubmit={(event) => void onSubmit(event)}
                className="mt-6 grid gap-4 rounded-md border border-border bg-card p-5"
              >
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
          </>
        )}
      </main>
    </div>
  );
}

/** Placeholder until the 2FA step exists (T13). Nothing is stored. */
function TwoFactorPlaceholder({ onBack }: { onBack: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="two-factor-title" className="mt-6">
      <h1
        id="two-factor-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight outline-none"
      >
        {COPY.login.twoFactor.title}
      </h1>
      <p className="mt-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info-strong">
        {COPY.login.twoFactor.description}
      </p>
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onBack}>
          {COPY.login.twoFactor.back}
        </Button>
      </div>
    </section>
  );
}
