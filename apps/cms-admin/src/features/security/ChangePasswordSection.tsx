import {
  Button,
  TextInput,
  FormAlert,
  type FormAlertTone,
} from '@abyss/form-commons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAppSelector } from '../../app/store';
import { PASSWORD_LENGTH } from '../../config/auth.constants';
import { COPY } from '../../config/copy.constants';
import { selectCurrentUser } from '../auth/auth.slice';
import {
  newPasswordShape,
  passwordsMatch,
  PASSWORDS_MATCH_ISSUE,
} from '../auth/password-form';
import { useSession } from '../auth/session-context';
import { useSecurityApi } from './security-api-context';
import { toSecurityError } from './security-error';

const copy = COPY.security;

const changeSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, copy.validation.passwordRequired)
      .max(PASSWORD_LENGTH.MAX, copy.errors.wrongPassword),
    ...newPasswordShape,
  })
  .refine(passwordsMatch, PASSWORDS_MATCH_ISSUE);
type ChangeValues = z.input<typeof changeSchema>;

/**
 * Change password (T12 API, T13 UI). Success ends every session, this one
 * included, so the user lands on sign-in with a notice.
 */
export function ChangePasswordSection() {
  const security = useSecurityApi();
  const session = useSession();
  const user = useAppSelector(selectCurrentUser);
  const [alert, setAlert] = useState<{
    tone: FormAlertTone;
    message: string;
  } | null>(null);

  const form = useForm<ChangeValues>({
    resolver: zodResolver(changeSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onTouched',
  });

  const change = useMutation({
    mutationFn: security.changePassword,
    // Every session ended server-side: end ours; the guard sends the user
    // to sign-in, which shows why.
    onSuccess: () => session.expire('password-changed'),
    onError: (cause) => {
      const error = toSecurityError(cause);
      if (error.kind === 'wrong-password') {
        form.resetField('currentPassword');
        form.setError(
          'currentPassword',
          { message: copy.errors.wrongPassword },
          { shouldFocus: true },
        );
      } else if (error.kind === 'weak-password') {
        form.setError(
          'newPassword',
          { message: COPY.password.errors.weakPassword },
          { shouldFocus: true },
        );
      } else if (error.kind === 'alert') {
        setAlert({ tone: error.tone, message: error.message });
      } else {
        setAlert({ tone: 'error', message: COPY.password.errors.unexpected });
      }
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setAlert(null);
    change.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  });

  return (
    <section
      aria-labelledby="password-heading"
      className="grid gap-4 rounded-md border border-border bg-card p-5"
    >
      <div className="grid gap-1">
        <h2 id="password-heading" className="text-base font-semibold">
          {copy.changePassword.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {copy.changePassword.description}
        </p>
      </div>
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="grid max-w-sm gap-4"
        >
          {alert !== null ? (
            <FormAlert tone={alert.tone}>{alert.message}</FormAlert>
          ) : null}
          {/* Hidden username so password managers update the right entry. */}
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={user?.email ?? ''}
            readOnly
            hidden
          />
          <TextInput<ChangeValues>
            name="currentPassword"
            label={copy.fields.currentPassword}
            type="password"
            autoComplete="current-password"
            required
          />
          <TextInput<ChangeValues>
            name="newPassword"
            label={COPY.password.newPasswordLabel}
            description={COPY.password.newPasswordHint}
            type="password"
            autoComplete="new-password"
            required
          />
          <TextInput<ChangeValues>
            name="confirmPassword"
            label={COPY.password.confirmPasswordLabel}
            type="password"
            autoComplete="new-password"
            required
          />
          <div>
            <Button type="submit" variant="primary" loading={change.isPending}>
              {copy.changePassword.submit}
            </Button>
          </div>
        </form>
      </FormProvider>
    </section>
  );
}
