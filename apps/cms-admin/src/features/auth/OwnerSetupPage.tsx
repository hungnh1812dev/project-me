import { Button, TextInput, FormAlert } from '@abyss/form-commons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { z } from 'zod';

import {
  OWNER_DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_LENGTH,
  SETUP_TOKEN_MAX_LENGTH,
} from '../../config/Auth.constants';
import { COPY } from '../../config/Copy.constants';
import { APP_ROUTES } from '../../config/App.routes';
import { AuthPageLayout } from './AuthPageLayout';
import { BackToSignIn } from './BackToSignIn';
import type { LoginNoticeState } from './LoginNotice.rules';
import { emailField } from './Password.form';
import { useSetupApi } from './SetupApi.context';
import { toSetupError } from './SetupError.errors';
import { SETUP_STATUS_QUERY_KEY, useSetupStatus } from './useSetupStatus.query';

const { validation } = COPY.setup;

const setupSchema = z
  .object({
    setupToken: z.string().min(1, validation.tokenRequired),
    email: emailField,
    displayName: z
      .string()
      .trim()
      .max(OWNER_DISPLAY_NAME_MAX_LENGTH, validation.displayNameTooLong),
    password: z
      .string()
      .min(PASSWORD_LENGTH.MIN, validation.passwordTooShort)
      .max(PASSWORD_LENGTH.MAX, validation.passwordTooLong),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: validation.passwordsDiffer,
    path: ['confirmPassword'],
  });
type SetupValues = z.input<typeof setupSchema>;
type SetupField = keyof SetupValues;

const EMPTY_VALUES: SetupValues = {
  setupToken: '',
  email: '',
  displayName: '',
  password: '',
  confirmPassword: '',
};

/** Fields the API can name in a 400; anything else becomes a form alert. */
const SERVER_FIELDS: readonly SetupField[] = [
  'email',
  'displayName',
  'password',
];

function isServerField(name: unknown): name is SetupField {
  return SERVER_FIELDS.some((field) => field === name);
}

function sentenceOf(message: string): string {
  const text = message.charAt(0).toUpperCase() + message.slice(1);
  return text.endsWith('.') ? text : `${text}.`;
}

/**
 * One-time owner setup (D1). Reachable only while cms-api says the setup is
 * open. The token and passwords live in form state only: never in the URL,
 * storage or the store, and they are cleared on success.
 */
export function OwnerSetupPage() {
  const setup = useSetupApi();
  const status = useSetupStatus();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formAlert, setFormAlert] = useState<string | null>(null);

  const form = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: EMPTY_VALUES,
    mode: 'onTouched',
  });

  const createOwner = useMutation({
    mutationFn: setup.createOwner,
    onSuccess: (_data, input) => {
      form.reset(EMPTY_VALUES);
      const state: LoginNoticeState = {
        notice: 'owner-created',
        email: input.email,
      };
      void navigate(APP_ROUTES.LOGIN, { replace: true, state });
      void queryClient.invalidateQueries({ queryKey: SETUP_STATUS_QUERY_KEY });
    },
    onError: (cause) => {
      const error = toSetupError(cause);
      switch (error.kind) {
        case 'token-invalid':
          form.setError(
            'setupToken',
            { message: COPY.setup.errors.tokenInvalid },
            { shouldFocus: true },
          );
          return;
        case 'email-taken':
          form.setError(
            'email',
            { message: COPY.setup.errors.emailTaken },
            { shouldFocus: true },
          );
          return;
        case 'setup-closed': {
          form.reset(EMPTY_VALUES);
          const state: LoginNoticeState = { notice: 'setup-complete' };
          void navigate(APP_ROUTES.LOGIN, { replace: true, state });
          void queryClient.invalidateQueries({
            queryKey: SETUP_STATUS_QUERY_KEY,
          });
          return;
        }
        case 'field-issues': {
          const unplaced = error.issues.filter((issue) => {
            const [name] = issue.path;
            if (!isServerField(name)) return true;
            form.setError(name, { message: sentenceOf(issue.message) });
            return false;
          });
          if (unplaced.length > 0) setFormAlert(COPY.setup.errors.unexpected);
          return;
        }
        case 'alert':
          setFormAlert(error.message);
      }
    },
  });

  if (status.isPending) {
    return (
      <AuthPageLayout>
        <output className="mt-6 block text-sm text-muted-foreground">
          {COPY.setup.checking}
        </output>
      </AuthPageLayout>
    );
  }
  if (status.isError) {
    return (
      <AuthPageLayout>
        <div className="mt-6 grid gap-3">
          <FormAlert tone="warning">{COPY.setup.statusFailed}</FormAlert>
          <div>
            <Button variant="secondary" onClick={() => void status.refetch()}>
              {COPY.setup.retry}
            </Button>
          </div>
        </div>
        <BackToSignIn />
      </AuthPageLayout>
    );
  }
  // After a successful submit the form has already navigated away.
  if (!status.data.open && !createOwner.isPending && !createOwner.isSuccess) {
    return <Navigate to={APP_ROUTES.LOGIN} replace />;
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormAlert(null);
    const displayName = values.displayName.trim();
    createOwner.mutate({
      setupToken: values.setupToken,
      email: values.email.trim(),
      ...(displayName === '' ? {} : { displayName }),
      password: values.password,
    });
  });

  return (
    <AuthPageLayout>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {COPY.setup.title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {COPY.setup.description}
      </p>
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="mt-6 grid gap-4 rounded-md border border-border bg-card p-5"
        >
          {formAlert !== null ? (
            <FormAlert tone="error">{formAlert}</FormAlert>
          ) : null}
          <TextInput<SetupValues>
            name="setupToken"
            label={COPY.setup.tokenLabel}
            type="password"
            autoComplete="off"
            maxLength={SETUP_TOKEN_MAX_LENGTH}
            spellCheck={false}
            required
          />
          <TextInput<SetupValues>
            name="email"
            label={COPY.setup.emailLabel}
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            required
          />
          <TextInput<SetupValues>
            name="displayName"
            label={COPY.setup.displayNameLabel}
            description={COPY.setup.displayNameHint}
            autoComplete="name"
            maxLength={OWNER_DISPLAY_NAME_MAX_LENGTH}
          />
          <TextInput<SetupValues>
            name="password"
            label={COPY.setup.passwordLabel}
            description={COPY.setup.passwordHint}
            type="password"
            autoComplete="new-password"
            required
          />
          <TextInput<SetupValues>
            name="confirmPassword"
            label={COPY.setup.confirmPasswordLabel}
            type="password"
            autoComplete="new-password"
            required
          />
          <Button
            type="submit"
            variant="primary"
            className="mt-2 w-full"
            loading={createOwner.isPending}
          >
            {COPY.setup.submit}
          </Button>
        </form>
      </FormProvider>
      <BackToSignIn />
    </AuthPageLayout>
  );
}
