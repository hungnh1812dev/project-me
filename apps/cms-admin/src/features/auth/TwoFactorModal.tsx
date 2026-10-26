import {
  Button,
  TextInput,
  FormAlert,
  type FormAlertTone,
} from '@abyss/form-commons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Modal, ModalActions } from '../../components/Modal';
import {
  TOTP_CODE_LENGTH,
  TWO_FACTOR_METHODS,
  type TwoFactorMethod,
} from '../../config/Auth.constants';
import { COPY } from '../../config/Copy.constants';
import { API_ERROR_CODES } from '../../config/Http.constants';
import {
  type ApiFailure,
  apiFailureOf,
  rateLimitedMessage,
} from '../../lib/ApiFailure.errors';
import type { TwoFactorChallenge } from './Auth.api';
import { useSession } from './Session.context';
import { useEmailCode } from './useEmailCode.mutation';

const copy = COPY.login.twoFactor;
const CODE_PATTERN = new RegExp(`^\\d{${TOTP_CODE_LENGTH}}$`);

const codeSchema = z.object({
  code: z.string().trim().regex(CODE_PATTERN, copy.codeInvalid),
});
type CodeValues = z.input<typeof codeSchema>;

interface Alert {
  tone: FormAlertTone;
  message: string;
}

function methodOf(methods: readonly string[]): TwoFactorMethod | undefined {
  return TWO_FACTOR_METHODS.find((method) => methods.includes(method));
}

/** Failure -> alert, or 'expired' when the temp token is dead. */
function alertOf(failure: ApiFailure): Alert | 'expired' {
  switch (failure.kind) {
    case 'rate-limited':
      return {
        tone: 'warning',
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { tone: 'warning', message: COPY.password.errors.network };
    case 'http':
      if (failure.errorCode === API_ERROR_CODES.INVALID_TEMP_TOKEN) {
        return 'expired';
      }
      if (failure.errorCode === API_ERROR_CODES.INVALID_2FA_CODE) {
        return { tone: 'error', message: copy.errors.invalidCode };
      }
      return { tone: 'error', message: COPY.password.errors.unexpected };
    case 'unexpected':
      return { tone: 'error', message: COPY.password.errors.unexpected };
  }
}

/**
 * Second sign-in step (D8): the code for the temp token from login. On
 * success the session starts and the login page moves on by itself.
 * `onExpired` = the temp token died (5 wrong codes or 300 s): sign in again.
 */
export function TwoFactorModal({
  challenge,
  onCancel,
  onExpired,
}: {
  challenge: TwoFactorChallenge;
  onCancel: () => void;
  onExpired: () => void;
}) {
  const method = methodOf(challenge.methods);
  return (
    <Modal
      title={copy.title}
      description={
        method === 'email' ? copy.emailDescription : copy.totpDescription
      }
      onClose={onCancel}
    >
      {method === undefined ? (
        <>
          <FormAlert tone="error">{copy.errors.unsupportedMethod}</FormAlert>
          <ModalActions>
            <Button type="button" onClick={onCancel}>
              {copy.cancel}
            </Button>
          </ModalActions>
        </>
      ) : (
        <CodeForm
          method={method}
          tempToken={challenge.tempToken}
          onCancel={onCancel}
          onExpired={onExpired}
        />
      )}
    </Modal>
  );
}

function CodeForm({
  method,
  tempToken,
  onCancel,
  onExpired,
}: {
  method: TwoFactorMethod;
  tempToken: string;
  onCancel: () => void;
  onExpired: () => void;
}) {
  const session = useSession();
  const [alert, setAlert] = useState<Alert | null>(null);
  // A dead temp token ends the step, whichever call found out.
  const email = useEmailCode(
    () => session.sendLoginEmailCode(tempToken),
    method === 'email',
    (failure) => {
      if (alertOf(failure) === 'expired') onExpired();
    },
  );
  const form = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
    mode: 'onTouched',
  });

  useEffect(() => {
    form.setFocus('code');
  }, [form]);

  const verify = useMutation({
    mutationFn: session.completeTwoFactor,
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

  const sendAlert = email.failure === null ? null : alertOf(email.failure);
  const shown = alert ?? (sendAlert === 'expired' ? null : sendAlert);
  const resent = method === 'email' && email.sentCount > 1 && shown === null;

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="grid gap-4"
      >
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
          maxLength={TOTP_CODE_LENGTH}
          spellCheck={false}
          className="tabular-nums tracking-widest"
          required
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
        <ModalActions>
          <Button type="button" onClick={onCancel}>
            {copy.cancel}
          </Button>
          <Button type="submit" variant="primary" loading={verify.isPending}>
            {copy.submit}
          </Button>
        </ModalActions>
      </form>
    </FormProvider>
  );
}
