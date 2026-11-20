'use client';

import { useCallback, useState, type RefObject } from 'react';
import {
  Button,
  CheckboxInput,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FormAlert,
  TextInput,
} from '@abyss/form-commons';
import {
  HUMAN_CHECK_FORMS,
  resetTurnstile,
  TurnstileSlot,
  useTurnstile,
} from '@abyss/form-commons/human-check';
import { useMutation } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';

import type { Alert } from '@/apis/client/ClientApi.errors';
import { appEnv } from '@/configs/Browser.env';

import { useWebSession, type TwoFactorChallenge } from '../session';
import { credentialAlertOf, loginErrorAlertOf } from './LoginAlerts.rules';
import type { SignInText } from './SignIn.graphql';
import { TwoFactorStep } from './TwoFactorStep';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginValues {
  email: string;
  password: string;
  rememberMe: boolean;
}

/**
 * Sign-in dialog with the 2FA step. Credentials go to the BFF of this site,
 * which keeps the tokens in a sealed HttpOnly cookie; the browser never holds one. Each opening remounts the flow (keyed by an opening counter), so it starts clean even when
 * the dialog reopens while the exit animation still keeps the content mounted.
 */
export function WebLoginDialog({
  open,
  onOpenChange,
  returnFocusRef,
  text,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Element that gets focus on close; the opener may have re-rendered since the dialog opened. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  text: SignInText;
}) {
  const siteKey = appEnv.turnstileSiteKey;
  const [openingCount, setOpeningCount] = useState(open ? 1 : 0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpeningCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current == null) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        {siteKey === undefined ? (
          <HumanCheckUnavailable text={text} />
        ) : (
          <LoginFlow
            key={openingCount}
            siteKey={siteKey}
            text={text}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function HumanCheckUnavailable({ text: copy }: { text: SignInText }) {
  return (
    <DialogHeader>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogDescription>{copy.humanCheck.unavailable}</DialogDescription>
    </DialogHeader>
  );
}

function LoginFlow({
  siteKey,
  text: copy,
  onClose,
}: {
  siteKey: string;
  text: SignInText;
  onClose: () => void;
}) {
  const session = useWebSession();
  const turnstileToken = useTurnstile(HUMAN_CHECK_FORMS.LOGIN, siteKey);
  const [isTokenMissing, setIsTokenMissing] = useState(false);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const [hasExpired, setHasExpired] = useState(false);

  const form = useForm<LoginValues>({
    defaultValues: { email: '', password: '', rememberMe: false },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const signIn = useMutation({
    mutationFn: session.signIn,
    onSettled: () => resetTurnstile(HUMAN_CHECK_FORMS.LOGIN),
    onSuccess: (outcome) => {
      if (outcome.kind === 'signed-in') {
        onClose();
        return;
      }
      form.resetField('password');
      setChallenge({ methods: outcome.methods });
    },
    onError: (cause) => {
      setAlert(
        loginErrorAlertOf(cause, copy.errors, (failure) => credentialAlertOf(failure, copy.errors)),
      );
      form.resetField('password');
      form.resetField('rememberMe');
      form.setFocus('password');
    },
  });

  const closeChallenge = useCallback(() => {
    setChallenge(null);
    form.resetField('rememberMe');
    form.setFocus('password');
  }, [form]);
  const expireChallenge = useCallback(() => {
    setHasExpired(true);
    closeChallenge();
  }, [closeChallenge]);

  const onSubmit = form.handleSubmit((values) => {
    setAlert(null);
    setHasExpired(false);
    if (turnstileToken === '') {
      setIsTokenMissing(true);
      resetTurnstile(HUMAN_CHECK_FORMS.LOGIN);
      return;
    }
    setIsTokenMissing(false);
    signIn.mutate({
      email: values.email.trim(),
      password: values.password,
      rememberMe: values.rememberMe,
      turnstileToken,
    });
  });

  if (challenge !== null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{copy.twoFactor.title}</DialogTitle>
          <DialogDescription className="sr-only">{copy.twoFactor.title}</DialogDescription>
        </DialogHeader>
        <TwoFactorStep
          challenge={challenge}
          siteKey={siteKey}
          text={copy}
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
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="grid gap-4">
          {hasExpired ? <FormAlert tone="info">{copy.twoFactor.expired}</FormAlert> : null}
          {alert !== null ? <FormAlert tone={alert.tone}>{alert.message}</FormAlert> : null}
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
                (typeof value === 'string' && EMAIL_SHAPE.test(value.trim())) ||
                copy.validation.emailInvalid,
            }}
          />
          <TextInput<LoginValues>
            name="password"
            label={copy.passwordLabel}
            type="password"
            autoComplete="current-password"
            rules={{ required: copy.validation.passwordRequired }}
          />
          <CheckboxInput<LoginValues>
            name="rememberMe"
            label={copy.rememberMeLabel}
            description={copy.rememberMeHint}
          />
          <div className="grid gap-1">
            <TurnstileSlot formId={HUMAN_CHECK_FORMS.LOGIN} text={copy.humanCheck} />
            {isTokenMissing && turnstileToken === '' ? (
              <p role="alert" className="text-destructive-strong text-sm">
                {copy.humanCheck.required}
              </p>
            ) : null}
          </div>
          {/* Stacked order is not reversed: Cancel stays above the confirm button and first in Tab order. */}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
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
