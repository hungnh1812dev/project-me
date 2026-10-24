import {
  Button,
  TextInput,
  FormAlert,
  type FormAlertTone,
} from '@abyss/form-commons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import { ModalActions } from '../../components/Modal';
import {
  PASSWORD_LENGTH,
  TOTP_CODE_LENGTH,
  type TwoFactorMethod,
} from '../../config/auth.constants';
import { COPY } from '../../config/copy.constants';
import { type ApiFailure, rateLimitedMessage } from '../auth/api-failure';
import type { useEmailCode } from '../auth/use-email-code';
import { toSecurityError } from './security-error';

const copy = COPY.security;
const CODE_PATTERN = new RegExp(`^\\d{${TOTP_CODE_LENGTH}}$`);

const confirmSchema = z.object({
  code: z.string().trim().regex(CODE_PATTERN, copy.validation.codeInvalid),
  password: z
    .string()
    .min(1, copy.validation.passwordRequired)
    .max(PASSWORD_LENGTH.MAX, copy.errors.wrongPassword),
});
type ConfirmValues = z.input<typeof confirmSchema>;

export interface ConfirmValuesOut {
  code: string;
  password: string;
}

interface Alert {
  tone: FormAlertTone;
  message: string;
}

/** Why the last email code could not be sent, as an alert. */
function sendAlertOf(failure: ApiFailure | null): Alert | null {
  if (failure === null) return null;
  if (failure.kind === 'rate-limited') {
    return {
      tone: 'warning',
      message: rateLimitedMessage(failure.retryAfterSeconds),
    };
  }
  if (failure.kind === 'network') {
    return { tone: 'warning', message: COPY.password.errors.network };
  }
  return { tone: 'error', message: COPY.password.errors.unexpected };
}

/**
 * Code + current password, the confirmation every 2FA change needs (D8).
 * Wrong password or code marks its field; a state change made elsewhere
 * calls `onStateChanged`. With `emailCode`, offers a resend link.
 */
export function ConfirmWithCodeForm({
  method,
  submit,
  submitLabel,
  submitVariant,
  cancelLabel,
  onCancel,
  onDone,
  onStateChanged,
  onSetupExpired,
  emailCode,
  children,
}: {
  method: TwoFactorMethod;
  submit: (values: ConfirmValuesOut) => Promise<void>;
  submitLabel: string;
  submitVariant: 'primary' | 'warning';
  cancelLabel: string;
  onCancel: () => void;
  onDone: () => void;
  onStateChanged: () => void;
  onSetupExpired?: () => void;
  emailCode?: ReturnType<typeof useEmailCode>;
  /** Shown above the fields (QR code, warnings). */
  children?: ReactNode;
}) {
  const [alert, setAlert] = useState<Alert | null>(null);
  const form = useForm<ConfirmValues>({
    resolver: zodResolver(confirmSchema),
    defaultValues: { code: '', password: '' },
    mode: 'onTouched',
  });

  const mutation = useMutation({
    mutationFn: submit,
    onSuccess: onDone,
    onError: (cause) => {
      const error = toSecurityError(cause);
      switch (error.kind) {
        case 'wrong-password':
          form.resetField('password');
          form.setError(
            'password',
            { message: copy.errors.wrongPassword },
            { shouldFocus: true },
          );
          return;
        case 'invalid-code':
          form.resetField('code');
          form.setError(
            'code',
            { message: copy.errors.invalidCode },
            { shouldFocus: true },
          );
          return;
        case 'state-changed':
          onStateChanged();
          return;
        case 'setup-expired':
          if (onSetupExpired === undefined) break;
          form.resetField('code');
          onSetupExpired();
          setAlert({ tone: 'info', message: copy.errors.setupExpired });
          return;
        case 'alert':
          setAlert({ tone: error.tone, message: error.message });
          return;
        case 'weak-password':
          break;
      }
      setAlert({ tone: 'error', message: COPY.password.errors.unexpected });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setAlert(null);
    mutation.mutate({ code: values.code.trim(), password: values.password });
  });

  const sendAlert = sendAlertOf(emailCode?.failure ?? null);
  const shown = alert ?? sendAlert;
  const resent =
    emailCode !== undefined && emailCode.sentCount > 1 && shown === null;

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="grid gap-4"
      >
        {children}
        {shown !== null ? (
          <FormAlert tone={shown.tone}>{shown.message}</FormAlert>
        ) : null}
        {resent ? <FormAlert tone="info">{copy.codeResent}</FormAlert> : null}
        <TextInput<ConfirmValues>
          name="code"
          label={
            method === 'email' ? copy.fields.emailCode : copy.fields.totpCode
          }
          description={
            method === 'email' ? copy.fields.emailHint : copy.fields.totpHint
          }
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={TOTP_CODE_LENGTH}
          spellCheck={false}
          className="tabular-nums tracking-widest"
          required
        />
        {emailCode !== undefined ? (
          <p>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0"
              loading={emailCode.isSending}
              disabled={emailCode.coolingDown}
              onClick={emailCode.resend}
            >
              {copy.resendCode}
            </Button>
          </p>
        ) : null}
        <TextInput<ConfirmValues>
          name="password"
          label={copy.fields.currentPassword}
          type="password"
          autoComplete="current-password"
          required
        />
        <ModalActions>
          <Button type="button" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            variant={submitVariant}
            loading={mutation.isPending}
          >
            {submitLabel}
          </Button>
        </ModalActions>
      </form>
    </FormProvider>
  );
}
