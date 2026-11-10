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
import { useMutation } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';

import type { Alert } from '@/apis/client/ApiFailure.errors';
import { appEnv } from '@/configs/Browser.env';
import { TURNSTILE } from '@/configs/Security.constants';
import { useRequiredSignInText } from '@/features/site-shell';

import { useWebSession, type TwoFactorChallenge } from '../session';
import { credentialAlertOf, loginErrorAlertOf } from './LoginAlerts.rules';
import { TwoFactorStep } from './TwoFactorStep';
import { useHumanCheck } from './useHumanCheck';

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Element that gets focus on close; the opener may have re-rendered since the dialog opened. */
  returnFocusRef?: RefObject<HTMLElement | null>;
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
          <HumanCheckUnavailable />
        ) : (
          <LoginFlow key={openingCount} siteKey={siteKey} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function HumanCheckUnavailable() {
  const copy = useRequiredSignInText();
  return (
    <DialogHeader>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogDescription>{copy.humanCheck.unavailable}</DialogDescription>
    </DialogHeader>
  );
}

function LoginFlow({ siteKey, onClose }: { siteKey: string; onClose: () => void }) {
  const session = useWebSession();
  const copy = useRequiredSignInText();
  const humanCheck = useHumanCheck(siteKey, TURNSTILE.ACTIONS.LOGIN);
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
    const humanCheckToken = humanCheck.requireToken();
    if (humanCheckToken === null) return;
    signIn.mutate({
      email: values.email.trim(),
      password: values.password,
      rememberMe: values.rememberMe,
      humanCheckToken,
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
          {humanCheck.field}
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
