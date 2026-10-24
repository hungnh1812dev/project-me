'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  TextInput,
  FormAlert,
} from '@abyss/form-commons';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { COPY } from '../../config/copy.constants';
import type { Alert } from '../../lib/alert';
import type { TwoFactorChallenge } from '../session';
import { credentialAlertOf, loginErrorAlertOf } from './login-alerts';
import { TwoFactorStep } from './TwoFactorStep';
import { useWebSession } from '../session';

const copy = COPY.login;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginValues {
  email: string;
  password: string;
}

/**
 * Sign-in dialog with the 2FA step. Credentials go from the browser straight
 * to cms-api, which sets the refresh cookie; nothing passes through the Next
 * server. Its content unmounts on close, so each opening starts clean.
 */
export function WebLoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <LoginFlow onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function LoginFlow({ onClose }: { onClose: () => void }) {
  const session = useWebSession();
  const [alert, setAlert] = useState<Alert | null>(null);
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const [hasExpired, setHasExpired] = useState(false);

  const form = useForm<LoginValues>({
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const signIn = useMutation({
    mutationFn: session.signIn,
    onSuccess: (outcome) => {
      if (outcome.kind === 'signed-in') {
        onClose();
        return;
      }
      form.resetField('password');
      setChallenge({ tempToken: outcome.tempToken, methods: outcome.methods });
    },
    onError: (cause) => {
      setAlert(loginErrorAlertOf(cause, credentialAlertOf));
      form.resetField('password');
      form.setFocus('password');
    },
  });

  const closeChallenge = useCallback(() => {
    setChallenge(null);
    form.setFocus('password');
  }, [form]);
  const expireChallenge = useCallback(() => {
    setHasExpired(true);
    closeChallenge();
  }, [closeChallenge]);

  const onSubmit = form.handleSubmit((values) => {
    setAlert(null);
    setHasExpired(false);
    signIn.mutate({ email: values.email.trim(), password: values.password });
  });

  if (challenge !== null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{copy.twoFactor.title}</DialogTitle>
          <DialogDescription className="sr-only">
            {copy.twoFactor.title}
          </DialogDescription>
        </DialogHeader>
        <TwoFactorStep
          challenge={challenge}
          onCancel={closeChallenge}
          onExpired={expireChallenge}
          onDone={onClose}
        />
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="grid gap-4"
        >
          {hasExpired ? (
            <FormAlert tone="info">{copy.twoFactor.expired}</FormAlert>
          ) : null}
          {alert !== null ? (
            <FormAlert tone={alert.tone}>{alert.message}</FormAlert>
          ) : null}
          <TextInput<LoginValues>
            name="email"
            label={copy.emailLabel}
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            rules={{
              required: copy.validation.emailRequired,
              validate: (value) =>
                EMAIL_SHAPE.test(value.trim()) || copy.validation.emailInvalid,
            }}
          />
          <TextInput<LoginValues>
            name="password"
            label={copy.passwordLabel}
            type="password"
            autoComplete="current-password"
            rules={{ required: copy.validation.passwordRequired }}
          />
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              {copy.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={signIn.isPending}>
              {copy.submit}
            </Button>
          </div>
        </form>
      </FormProvider>
    </>
  );
}
