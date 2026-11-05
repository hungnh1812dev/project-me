import { useState } from 'react';
import { Button, FormAlert, TextInput, type FormAlertTone } from '@abyss/form-commons';
import { PASSWORD_LENGTH } from '@configs/Auth.constants';
import { COMMON_TEXT, useScreenText, type ScreenText } from '@configs/locales';
import {
  newPasswordShape,
  PASSWORDS_MATCH_ISSUE,
  passwordsMatch,
  useCurrentUser,
  useSession,
} from '@features/auth';
import { toSecurityError } from '@features/security/Security.errors';
import { useSecurityApi } from '@features/security/SecurityApi.context';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

type SecurityCopy = ScreenText<'security'>['security'];

const changeSchemaOf = (copy: SecurityCopy) =>
  z
    .object({
      currentPassword: z
        .string()
        .min(1, copy.validation.passwordRequired)
        .max(PASSWORD_LENGTH.MAX, copy.errors.wrongPassword),
      ...newPasswordShape,
    })
    .refine(passwordsMatch, PASSWORDS_MATCH_ISSUE);
type ChangeValues = z.input<ReturnType<typeof changeSchemaOf>>;

/**
 * Change password. Success ends every session, this one
 * included, so the user lands on sign-in with a notice.
 */
export function ChangePasswordSection() {
  const copy = useScreenText('security').security;
  const security = useSecurityApi();
  const session = useSession();
  const user = useCurrentUser();
  const [alert, setAlert] = useState<{
    tone: FormAlertTone;
    message: string;
  } | null>(null);

  const form = useForm<ChangeValues>({
    resolver: zodResolver(changeSchemaOf(copy)),
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
          { message: COMMON_TEXT.password.errors.weakPassword },
          { shouldFocus: true },
        );
      } else if (error.kind === 'alert') {
        setAlert({ tone: error.tone, message: error.message });
      } else {
        setAlert({ tone: 'error', message: COMMON_TEXT.password.errors.unexpected });
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
        <p className="text-sm text-muted-foreground">{copy.changePassword.description}</p>
      </div>
      <FormProvider {...form}>
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="grid max-w-sm gap-4">
          {alert !== null ? <FormAlert tone={alert.tone}>{alert.message}</FormAlert> : null}
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
            label={COMMON_TEXT.password.newPasswordLabel}
            description={COMMON_TEXT.password.newPasswordHint}
            type="password"
            autoComplete="new-password"
            required
          />
          <TextInput<ChangeValues>
            name="confirmPassword"
            label={COMMON_TEXT.password.confirmPasswordLabel}
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
