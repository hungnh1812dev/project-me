import { Button, TextInput, FormAlert } from '@abyss/form-commons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';

import { OTP_CODE_LENGTH } from '../../config/Auth.constants';
import { COPY } from '../../config/Copy.constants';
import { APP_ROUTES } from '../../config/App.routes';
import { AuthPageLayout } from './AuthPageLayout';
import { BackToSignIn } from './BackToSignIn';
import type { LoginNoticeState } from './LoginNotice.rules';
import { usePasswordApi } from './PasswordApi.context';
import { type PasswordError, toPasswordError } from './PasswordError.errors';
import {
  ALERT_TONE_BY_ERROR,
  codeField,
  emailField,
  newPasswordShape,
  passwordsMatch,
  PASSWORDS_MATCH_ISSUE,
} from './Password.form';

const setSchema = z
  .object({ email: emailField, code: codeField, ...newPasswordShape })
  .refine(passwordsMatch, PASSWORDS_MATCH_ISSUE);
type SetValues = z.input<typeof setSchema>;

/**
 * Invitation: the invited person enters the emailed code and chooses
 * a password; the account becomes active. A fresh code can be requested
 * here, since one lasts only a few minutes.
 */
export function SetPasswordPage() {
  const passwords = usePasswordApi();
  const navigate = useNavigate();
  const [error, setError] = useState<PasswordError | null>(null);
  const [resentTo, setResentTo] = useState<string | null>(null);

  const form = useForm<SetValues>({
    resolver: zodResolver(setSchema),
    defaultValues: {
      email: '',
      code: '',
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onTouched',
  });

  const setPassword = useMutation({
    mutationFn: passwords.setPassword,
    onSuccess: () => {
      const state: LoginNoticeState = { notice: 'password-set' };
      void navigate(APP_ROUTES.LOGIN, { replace: true, state });
    },
    onError: (cause) => {
      const mapped = toPasswordError(cause);
      setResentTo(null);
      if (mapped.kind === 'invalid-code') form.setFocus('code');
      setError(mapped);
    },
  });

  const resend = useMutation({
    mutationFn: passwords.requestCode,
    onSuccess: (_data, email) => {
      setError(null);
      setResentTo(email);
      form.resetField('code');
      form.setFocus('code');
    },
    onError: (cause) => {
      setResentTo(null);
      setError(toPasswordError(cause));
    },
  });

  const onResend = async () => {
    const emailOk = await form.trigger('email', { shouldFocus: true });
    // An invalid email shows its inline error and takes focus.
    if (!emailOk) return;
    resend.mutate(form.getValues('email').trim());
  };

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    setPassword.mutate({
      email: values.email.trim(),
      code: values.code.trim(),
      newPassword: values.newPassword,
    });
  });

  return (
    <AuthPageLayout>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {COPY.password.set.title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {COPY.password.set.description}
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
          {resentTo !== null ? (
            <FormAlert tone="info">
              {COPY.password.codeResent(resentTo)}
            </FormAlert>
          ) : null}
          <TextInput<SetValues>
            name="email"
            label={COPY.password.emailLabel}
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            required
          />
          <TextInput<SetValues>
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
          <TextInput<SetValues>
            name="newPassword"
            label={COPY.password.newPasswordLabel}
            description={COPY.password.newPasswordHint}
            type="password"
            autoComplete="new-password"
            required
          />
          <TextInput<SetValues>
            name="confirmPassword"
            label={COPY.password.confirmPasswordLabel}
            type="password"
            autoComplete="new-password"
            required
          />
          <Button
            type="submit"
            variant="primary"
            className="mt-2 w-full"
            loading={setPassword.isPending}
          >
            {COPY.password.set.submit}
          </Button>
        </form>
      </FormProvider>
      <div className="mt-4">
        <Button
          variant="link"
          className="h-auto px-0"
          loading={resend.isPending}
          onClick={() => void onResend()}
        >
          {COPY.password.resendCode}
        </Button>
      </div>
      <BackToSignIn />
    </AuthPageLayout>
  );
}
