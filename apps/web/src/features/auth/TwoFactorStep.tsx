'use client';

import { useEffect, useState } from 'react';
import { Button, FormAlert, TextInput } from '@abyss/form-commons';
import { useMutation } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';

import type { Alert } from '@/apis/client/ClientApi.errors';
import { API_ERROR_CODES, type WebApiError } from '@/apis/WebApi.errors';
import {
  LOGIN_CODE_LENGTH,
  TWO_FACTOR_METHODS,
  type TwoFactorMethod,
} from '@/configs/Auth.constants';
import { TURNSTILE } from '@/configs/Security.constants';
import { useRequiredSignInText, type SignInText } from '@/features/site-shell';

import { useWebSession, type TwoFactorChallenge } from '../session';
import { loginErrorAlertOf, sharedFailureAlertOf } from './LoginAlerts.rules';
import { useEmailCode } from './useEmailCode';
import { useHumanCheck } from './useHumanCheck';

const CODE_PATTERN = new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`);

interface CodeValues {
  code: string;
}

function methodOf(methods: readonly string[]): TwoFactorMethod | undefined {
  return TWO_FACTOR_METHODS.find((method) => methods.includes(method));
}

/** Failure -> alert, or 'expired' when the challenge is gone. */
function alertOf(failure: WebApiError, text: SignInText): Alert | 'expired' {
  const shared = sharedFailureAlertOf(failure, text.errors);
  if (shared !== null) return shared;
  if (failure.errorCode === API_ERROR_CODES.BFF.TWO_FACTOR_EXPIRED) {
    return 'expired';
  }
  if (failure.errorCode === API_ERROR_CODES.BFF.INVALID_TWO_FACTOR_CODE) {
    return { tone: 'error', message: text.twoFactor.invalidCode };
  }
  return { tone: 'error', message: text.errors.unexpected };
}

/**
 * Second sign-in step: the code for the temp token from login. On success the
 * session starts and the dialog closes (`onDone`). `onExpired` = the temp
 * token died (wrong codes or timeout): sign in again.
 */
export function TwoFactorStep({
  challenge,
  siteKey,
  onCancel,
  onExpired,
  onDone,
}: {
  challenge: TwoFactorChallenge;
  siteKey: string;
  onCancel: () => void;
  onExpired: () => void;
  onDone: () => void;
}) {
  const copy = useRequiredSignInText().twoFactor;
  const method = methodOf(challenge.methods);
  if (method === undefined) {
    return (
      <div className="grid gap-4">
        <FormAlert tone="error">{copy.unsupportedMethod}</FormAlert>
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
      siteKey={siteKey}
      onCancel={onCancel}
      onExpired={onExpired}
      onDone={onDone}
    />
  );
}

function CodeForm({
  method,
  siteKey,
  onCancel,
  onExpired,
  onDone,
}: {
  method: TwoFactorMethod;
  siteKey: string;
  onCancel: () => void;
  onExpired: () => void;
  onDone: () => void;
}) {
  const session = useWebSession();
  const text = useRequiredSignInText();
  const copy = text.twoFactor;
  const [alert, setAlert] = useState<Alert | null>(null);
  const humanCheck = useHumanCheck(siteKey, TURNSTILE.ACTIONS.TWO_FACTOR);
  // The emailed code goes out as soon as the first check passes; the next
  // check (a fresh token) is for the verify call.
  const email = useEmailCode(
    method === 'email'
      ? () => {
          const humanCheckToken = humanCheck.takeToken();
          return session.sendLoginEmailCode(humanCheckToken === null ? {} : { humanCheckToken });
        }
      : () => Promise.resolve(),
    (failure) => {
      if (alertOf(failure, text) === 'expired') onExpired();
    },
    method !== 'email' || humanCheck.hasToken,
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
      const mapped = loginErrorAlertOf(cause, text.errors, (failure) => alertOf(failure, text));
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
    const humanCheckToken = humanCheck.requireToken();
    if (humanCheckToken === null) return;
    verify.mutate({ code: values.code.trim(), humanCheckToken });
  });

  const sendAlert =
    method === 'email' && email.failure !== null ? alertOf(email.failure, text) : null;
  const shown = alert ?? (sendAlert === 'expired' ? null : sendAlert);
  const wasResent = method === 'email' && email.sentCount > 1 && shown === null;

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="grid gap-4">
        <p className="text-muted-foreground text-sm">
          {method === 'email' ? copy.emailDescription : copy.totpDescription}
        </p>
        {method === 'email' ? <FormAlert tone="warning">{copy.emailWarning}</FormAlert> : null}
        {shown !== null ? <FormAlert tone={shown.tone}>{shown.message}</FormAlert> : null}
        {wasResent ? <FormAlert tone="info">{copy.resent}</FormAlert> : null}
        <TextInput<CodeValues>
          name="code"
          label={method === 'email' ? copy.emailLabel : copy.totpLabel}
          description={method === 'email' ? copy.emailHint : copy.totpHint}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={LOGIN_CODE_LENGTH}
          spellCheck={false}
          className="tracking-widest tabular-nums"
          rules={{
            required: copy.codeInvalid,
            validate: (value) => CODE_PATTERN.test(value.trim()) || copy.codeInvalid,
          }}
        />
        {method === 'email' ? (
          <p>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0"
              loading={email.isSending}
              disabled={email.isCoolingDown}
              onClick={() => {
                if (humanCheck.hasToken) email.resend();
                else humanCheck.requireToken();
              }}
            >
              {copy.resend}
            </Button>
          </p>
        ) : null}
        {humanCheck.field}
        {/* Stacked order is not reversed: Cancel stays above the confirm button and first in Tab order. */}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
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
