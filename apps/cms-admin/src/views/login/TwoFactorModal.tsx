import { useEffect, useState } from 'react';
import { Button, FormAlert, TextInput, type FormAlertTone } from '@abyss/form-commons';
import { apiFailureOf, rateLimitedMessage, type ApiFailure } from '@apis/client/ApiFailure.errors';
import { Modal, ModalActions } from '@components/Modal';
import {
  TOTP_CODE_LENGTH,
  TWO_FACTOR_METHODS,
  type TwoFactorMethod,
} from '@configs/Auth.constants';
import { API_ERROR_CODES } from '@configs/Http.constants';
import { COMMON_TEXT, useScreenText, type ScreenText } from '@configs/locales';
import type { TwoFactorChallenge } from '@features/auth/Auth.api';
import { useSession } from '@features/auth/Session.context';
import { useEmailCode } from '@features/auth/useEmailCode';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

type TwoFactorCopy = ScreenText<'login'>['login']['twoFactor'];

const CODE_PATTERN = new RegExp(`^\\d{${TOTP_CODE_LENGTH}}$`);

const codeSchemaOf = (copy: TwoFactorCopy) =>
  z.object({
    code: z.string().trim().regex(CODE_PATTERN, copy.codeInvalid),
  });
type CodeValues = z.input<ReturnType<typeof codeSchemaOf>>;

interface Alert {
  tone: FormAlertTone;
  message: string;
}

function methodOf(methods: readonly string[]): TwoFactorMethod | undefined {
  return TWO_FACTOR_METHODS.find((method) => methods.includes(method));
}

/** Failure -> alert, or 'expired' when the temp token is dead. */
function alertOf(failure: ApiFailure, copy: TwoFactorCopy): Alert | 'expired' {
  switch (failure.kind) {
    case 'rate-limited':
      return {
        tone: 'warning',
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { tone: 'warning', message: COMMON_TEXT.password.errors.network };
    case 'http':
      if (failure.errorCode === API_ERROR_CODES.INVALID_TEMP_TOKEN) {
        return 'expired';
      }
      if (failure.errorCode === API_ERROR_CODES.INVALID_2FA_CODE) {
        return { tone: 'error', message: copy.errors.invalidCode };
      }
      return { tone: 'error', message: COMMON_TEXT.password.errors.unexpected };
    case 'unexpected':
      return { tone: 'error', message: COMMON_TEXT.password.errors.unexpected };
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
  const copy = useScreenText('login').login.twoFactor;
  const method = methodOf(challenge.methods);
  return (
    <Modal
      title={copy.title}
      description={method === 'email' ? copy.emailDescription : copy.totpDescription}
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
  const copy = useScreenText('login').login.twoFactor;
  const session = useSession();
  const [alert, setAlert] = useState<Alert | null>(null);
  // A dead temp token ends the step, whichever call found out.
  const email = useEmailCode(
    () => session.sendLoginEmailCode(tempToken),
    method === 'email',
    (failure) => {
      if (alertOf(failure, copy) === 'expired') onExpired();
    },
  );
  const form = useForm<CodeValues>({
    resolver: zodResolver(codeSchemaOf(copy)),
    defaultValues: { code: '' },
    mode: 'onTouched',
  });

  useEffect(() => {
    form.setFocus('code');
  }, [form]);

  const verify = useMutation({
    mutationFn: session.completeTwoFactor,
    onError: (cause) => {
      const mapped = alertOf(apiFailureOf(cause), copy);
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

  const sendAlert = email.failure === null ? null : alertOf(email.failure, copy);
  const shown = alert ?? (sendAlert === 'expired' ? null : sendAlert);
  const resent = method === 'email' && email.sentCount > 1 && shown === null;

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="grid gap-4">
        {method === 'email' ? <FormAlert tone="warning">{copy.emailWarning}</FormAlert> : null}
        {shown !== null ? <FormAlert tone={shown.tone}>{shown.message}</FormAlert> : null}
        {resent ? <FormAlert tone="info">{copy.resent}</FormAlert> : null}
        <TextInput<CodeValues>
          name="code"
          label={method === 'email' ? copy.emailLabel : copy.totpLabel}
          description={method === 'email' ? copy.emailHint : copy.totpHint}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={TOTP_CODE_LENGTH}
          spellCheck={false}
          className="tracking-widest tabular-nums"
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
