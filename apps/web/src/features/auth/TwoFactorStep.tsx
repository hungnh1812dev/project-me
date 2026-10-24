'use client';

import { Button, TextInput, FormAlert } from '@abyss/form-commons';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import {
  LOGIN_CODE_LENGTH,
  TWO_FACTOR_METHODS,
  type TwoFactorMethod,
} from '../../config/auth.constants';
import { COPY } from '../../config/copy.constants';
import { API_ERROR_CODES } from '../../config/http.constants';
import {
  type ApiFailure,
  apiFailureOf,
  type LoginAlert,
  rateLimitedMessage,
} from './api-failure';
import type { TwoFactorChallenge } from './auth.api';
import { useEmailCode } from './use-email-code';
import { useWebSession } from './useWebSession';

const copy = COPY.login.twoFactor;
const CODE_PATTERN = new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`);

interface CodeValues {
  code: string;
}

function methodOf(methods: readonly string[]): TwoFactorMethod | undefined {
  return TWO_FACTOR_METHODS.find((method) => methods.includes(method));
}

/** Failure -> alert, or 'expired' when the temp token is dead. */
function alertOf(failure: ApiFailure): LoginAlert | 'expired' {
  switch (failure.kind) {
    case 'rate-limited':
      return {
        tone: 'warning',
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { tone: 'warning', message: COPY.login.errors.network };
    case 'privileged':
      return { tone: 'warning', message: COPY.login.errors.privileged };
    case 'http':
      if (failure.errorCode === API_ERROR_CODES.INVALID_TEMP_TOKEN) {
        return 'expired';
      }
      if (failure.errorCode === API_ERROR_CODES.INVALID_2FA_CODE) {
        return { tone: 'error', message: copy.errors.invalidCode };
      }
      return { tone: 'error', message: COPY.login.errors.unexpected };
    case 'unexpected':
      return { tone: 'error', message: COPY.login.errors.unexpected };
  }
}

/**
 * Second sign-in step: the code for the temp token from login. On success the
 * session starts and the dialog closes (`onDone`). `onExpired` = the temp
 * token died (wrong codes or timeout): sign in again.
 */
export function TwoFactorStep({
  challenge,
  onCancel,
  onExpired,
  onDone,
}: {
  challenge: TwoFactorChallenge;
  onCancel: () => void;
  onExpired: () => void;
  onDone: () => void;
}) {
  const method = methodOf(challenge.methods);
  if (method === undefined) {
    return (
      <div className="grid gap-4">
        <FormAlert tone="error">{copy.errors.unsupportedMethod}</FormAlert>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {copy.cancel}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <CodeForm
      method={method}
      tempToken={challenge.tempToken}
      onCancel={onCancel}
      onExpired={onExpired}
      onDone={onDone}
    />
  );
}

function CodeForm({
  method,
  tempToken,
  onCancel,
  onExpired,
  onDone,
}: {
  method: TwoFactorMethod;
  tempToken: string;
  onCancel: () => void;
  onExpired: () => void;
  onDone: () => void;
}) {
  const session = useWebSession();
  const [alert, setAlert] = useState<LoginAlert | null>(null);
  const email = useEmailCode(
    method === 'email'
      ? () => session.sendLoginEmailCode(tempToken)
      : () => Promise.resolve(),
    (failure) => {
      if (alertOf(failure) === 'expired') onExpired();
    },
  );
  const form = useForm<CodeValues>({
    defaultValues: { code: '' },
    mode: 'onTouched',
  });

  useEffect(() => {
    form.setFocus('code');
  }, [form]);

  const verify = useMutation({
    mutationFn: session.completeTwoFactor,
    onSuccess: onDone,
    onError: (cause) => {
      const mapped = alertOf(apiFailureOf(cause));
      if (mapped === 'expired') {
        onExpired();
        return;
      }
      setAlert(mapped);
      form.resetField('code');
      form.setFocus('code');
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setAlert(null);
    verify.mutate({ tempToken, code: values.code.trim() });
  });

  const sendAlert =
    method === 'email' && email.failure !== null
      ? alertOf(email.failure)
      : null;
  const shown = alert ?? (sendAlert === 'expired' ? null : sendAlert);
  const resent = method === 'email' && email.sentCount > 1 && shown === null;

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="grid gap-4"
      >
        <p className="text-sm text-muted-foreground">
          {method === 'email' ? copy.emailDescription : copy.totpDescription}
        </p>
        {method === 'email' ? (
          <FormAlert tone="warning">{copy.emailWarning}</FormAlert>
        ) : null}
        {shown !== null ? (
          <FormAlert tone={shown.tone}>{shown.message}</FormAlert>
        ) : null}
        {resent ? <FormAlert tone="info">{copy.resent}</FormAlert> : null}
        <TextInput<CodeValues>
          name="code"
          label={method === 'email' ? copy.emailLabel : copy.totpLabel}
          description={method === 'email' ? copy.emailHint : copy.totpHint}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={LOGIN_CODE_LENGTH}
          spellCheck={false}
          className="tabular-nums tracking-widest"
          rules={{
            required: copy.codeInvalid,
            validate: (value) =>
              CODE_PATTERN.test(value.trim()) || copy.codeInvalid,
          }}
        />
        {method === 'email' ? (
          <p>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0"
              loading={email.isSending}
              disabled={email.coolingDown}
              onClick={email.resend}
            >
              {copy.resend}
            </Button>
          </p>
        ) : null}
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {copy.cancel}
          </Button>
          <Button type="submit" variant="primary" loading={verify.isPending}>
            {copy.submit}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
