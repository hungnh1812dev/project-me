import { Button, TextInput } from '@abyss/form-commons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';

import { OTP_CODE_LENGTH } from '../../config/auth.constants';
import { COPY } from '../../config/copy.constants';
import { APP_ROUTES } from '../../config/routes';
import { AuthPageLayout } from './AuthPageLayout';
import { BackToSignIn } from './BackToSignIn';
import { FormAlert } from './FormAlert';
import type { LoginNoticeState } from './login-notice';
import { usePasswordApi } from './password-api-context';
import { type PasswordError, toPasswordError } from './password-error';
import {
  ALERT_TONE_BY_ERROR,
  codeField,
  emailField,
  optionalTotpField,
  newPasswordShape,
  passwordsMatch,
  PASSWORDS_MATCH_ISSUE,
} from './password-form';

const requestSchema = z.object({ email: emailField });
type RequestValues = z.input<typeof requestSchema>;

const resetSchema = z
  .object({ code: codeField, totpCode: optionalTotpField, ...newPasswordShape })
  .refine(passwordsMatch, PASSWORDS_MATCH_ISSUE);
type ResetValues = z.input<typeof resetSchema>;

/**
 * Forgotten password (T12): ask for a code by email, then enter it with the
 * new password. The first step never says whether the email has an account.
 */
export function ResetPasswordPage() {
  const [email, setEmail] = useState<string | null>(null);

  return (
    <AuthPageLayout>
      {email === null ? (
        <RequestCodeStep onSent={setEmail} />
      ) : (
        <ChoosePasswordStep
          email={email}
          onChangeEmail={() => setEmail(null)}
        />
      )}
    </AuthPageLayout>
  );
}

function RequestCodeStep({ onSent }: { onSent: (email: string) => void }) {
  const passwords = usePasswordApi();
  const [error, setError] = useState<PasswordError | null>(null);
  const form = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: '' },
    mode: 'onTouched',
  });
  const requestCode = useMutation({
    mutationFn: passwords.requestCode,
    onSuccess: (_data, email) => onSent(email),
    onError: (cause) => setError(toPasswordError(cause)),
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    requestCode.mutate(values.email.trim());
  });

  return (
    <>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {COPY.password.reset.requestTitle}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {COPY.password.reset.requestDescription}
      </p>
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="mt-6 grid gap-4 rounded-md border border-border bg-card p-5"
        >
          {error !== null ? (
            <FormAlert tone={ALERT_TONE_BY_ERROR[error.kind]}>
              {error.message}
            </FormAlert>
          ) : null}
          <TextInput<RequestValues>
            name="email"
            label={COPY.password.emailLabel}
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            required
          />
          <Button
            type="submit"
            variant="primary"
            className="mt-2 w-full"
            loading={requestCode.isPending}
          >
            {COPY.password.reset.sendCode}
          </Button>
        </form>
      </FormProvider>
      <BackToSignIn />
    </>
  );
}

function ChoosePasswordStep({
  email,
  onChangeEmail,
}: {
  email: string;
  onChangeEmail: () => void;
}) {
  const passwords = usePasswordApi();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState<PasswordError | null>(null);
  const [resent, setResent] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      code: '',
      newPassword: '',
      confirmPassword: '',
      totpCode: '',
    },
    mode: 'onTouched',
  });

  // New step: move focus to its heading so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (totpRequired) form.setFocus('totpCode');
  }, [totpRequired, form]);

  const reset = useMutation({
    mutationFn: passwords.reset,
    onSuccess: () => {
      const state: LoginNoticeState = { notice: 'password-reset' };
      void navigate(APP_ROUTES.LOGIN, { replace: true, state });
    },
    onError: (cause) => {
      const mapped = toPasswordError(cause);
      setResent(false);
      if (mapped.kind === 'totp-required') setTotpRequired(true);
      if (mapped.kind === 'invalid-code') form.setFocus('code');
      setError(mapped);
    },
  });

  const resend = useMutation({
    mutationFn: passwords.requestCode,
    onSuccess: () => {
      setError(null);
      setResent(true);
      form.resetField('code');
      form.setFocus('code');
    },
    onError: (cause) => {
      setResent(false);
      setError(toPasswordError(cause));
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const totpCode = values.totpCode.trim();
    if (totpRequired && totpCode === '') {
      form.setError(
        'totpCode',
        { message: COPY.password.validation.totpInvalid },
        { shouldFocus: true },
      );
      return;
    }
    setError(null);
    reset.mutate({
      email,
      code: values.code.trim(),
      newPassword: values.newPassword,
      ...(totpRequired ? { totpCode } : {}),
    });
  });

  return (
    <>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 text-2xl font-semibold tracking-tight outline-none"
      >
        {COPY.password.reset.title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {resent
          ? COPY.password.codeResent(email)
          : COPY.password.reset.codeSent(email)}
      </p>
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="mt-6 grid gap-4 rounded-md border border-border bg-card p-5"
        >
          {error !== null ? (
            <FormAlert tone={ALERT_TONE_BY_ERROR[error.kind]}>
              {error.message}
            </FormAlert>
          ) : null}
          {/* Hidden username field so password managers file the new password. */}
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            hidden
          />
          <TextInput<ResetValues>
            name="code"
            label={COPY.password.codeLabel}
            description={COPY.password.codeHint}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_CODE_LENGTH}
            spellCheck={false}
            className="tabular-nums tracking-widest"
            required
          />
          <TextInput<ResetValues>
            name="newPassword"
            label={COPY.password.newPasswordLabel}
            description={COPY.password.newPasswordHint}
            type="password"
            autoComplete="new-password"
            required
          />
          <TextInput<ResetValues>
            name="confirmPassword"
            label={COPY.password.confirmPasswordLabel}
            type="password"
            autoComplete="new-password"
            required
          />
          {totpRequired ? (
            <TextInput<ResetValues>
              name="totpCode"
              label={COPY.password.totpLabel}
              description={COPY.password.totpHint}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_CODE_LENGTH}
              spellCheck={false}
              className="tabular-nums tracking-widest"
              required
            />
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="mt-2 w-full"
            loading={reset.isPending}
          >
            {COPY.password.reset.submit}
          </Button>
        </form>
      </FormProvider>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          variant="link"
          className="h-auto px-0"
          loading={resend.isPending}
          onClick={() => resend.mutate(email)}
        >
          {COPY.password.resendCode}
        </Button>
        <Button variant="link" className="h-auto px-0" onClick={onChangeEmail}>
          {COPY.password.reset.otherEmail}
        </Button>
      </div>
      <BackToSignIn />
    </>
  );
}
