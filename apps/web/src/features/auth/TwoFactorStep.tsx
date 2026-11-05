'use client';

import { useEffect, useState } from 'react';
import { Button, FormAlert, TextInput } from '@abyss/form-commons';
import { useMutation } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';

import type { Alert, ApiFailure } from '../../apis/client/ApiFailure.errors';
import {
  BFF_ERROR_CODES,
  LOGIN_CODE_LENGTH,
  TWO_FACTOR_METHODS,
  type TwoFactorMethod,
} from '../../configs/Auth.constants';
import { COPY } from '../../configs/Copy.constants';
import { useWebSession, type TwoFactorChallenge } from '../session';
import { loginErrorAlertOf, sharedFailureAlertOf } from './LoginAlerts.rules';
import { useEmailCode } from './useEmailCode';

const copy = COPY.login.twoFactor;
const CODE_PATTERN = new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`);

interface CodeValues {
  code: string;
}

function methodOf(methods: readonly string[]): TwoFactorMethod | undefined {
  return TWO_FACTOR_METHODS.find((method) => methods.includes(method));
}

/** Failure -> alert, or 'expired' when the challenge is gone. */
function alertOf(failure: ApiFailure): Alert | 'expired' {
  const shared = sharedFailureAlertOf(failure);
  if (shared !== null) return shared;
  if (failure.kind === 'http' && failure.errorCode === BFF_ERROR_CODES.TWO_FACTOR_EXPIRED) {
    return 'expired';
  }
  if (failure.kind === 'http' && failure.errorCode === BFF_ERROR_CODES.INVALID_TWO_FACTOR_CODE) {
    return { tone: 'error', message: copy.errors.invalidCode };
  }
  return { tone: 'error', message: COPY.login.errors.unexpected };
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
  return <CodeForm method={method} onCancel={onCancel} onExpired={onExpired} onDone={onDone} />;
}

function CodeForm({
  method,
  onCancel,
  onExpired,
  onDone,
}: {
  method: TwoFactorMethod;
  onCancel: () => void;
  onExpired: () => void;
  onDone: () => void;
}) {
  const session = useWebSession();
  const [alert, setAlert] = useState<Alert | null>(null);
  const email = useEmailCode(
    method === 'email' ? () => session.sendLoginEmailCode() : () => Promise.resolve(),
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
      const mapped = loginErrorAlertOf(cause, alertOf);
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
    verify.mutate({ code: values.code.trim() });
  });

  const sendAlert = method === 'email' && email.failure !== null ? alertOf(email.failure) : null;
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
