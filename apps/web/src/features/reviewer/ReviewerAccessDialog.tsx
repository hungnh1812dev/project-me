'use client';

import {
  Button,
  CheckboxInput,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  SelectInput,
  TextAreaInput,
  TextInput,
} from '@abyss/form-commons';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';

import { COPY } from '../../config/copy.constants';
import {
  REVIEWER_INPUT_LIMITS,
  REVIEWER_OTHER_VALUE,
  REVIEWER_PURPOSE_TAGS,
  REVIEWER_VISITOR_ROLES,
} from '../../config/reviewer.constants';
import { apiFailureOf } from '../auth/api-failure';
import { FormAlert } from '../auth/FormAlert';
import { useWebSession } from '../auth/useWebSession';
import { apiClient } from '../../lib/api-client';
import { createReviewerApi, type ReviewerApi } from './reviewer.api';
import { reviewerAlertOf, type ReviewerAlert } from './reviewer-error';
import { TurnstileWidget } from './TurnstileWidget';

const copy = COPY.reviewer;
const limits = REVIEWER_INPUT_LIMITS;
const defaultApi = createReviewerApi(apiClient);

export interface ReviewerFormValues {
  role: string;
  roleOther: string;
  purposeChecks: boolean[];
  purposeOtherChecked: boolean;
  purposeOther: string;
  notes: string;
}

type FieldName = keyof ReviewerFormValues | `purposeChecks.${number}`;

/** Fields validated before moving past each step. */
const STEP_FIELDS: readonly (readonly FieldName[])[] = [
  ['role', 'roleOther'],
  ['purposeOtherChecked', 'purposeOther'],
  ['notes'],
];
const LAST_STEP = STEP_FIELDS.length - 1;

const DEFAULT_VALUES: ReviewerFormValues = {
  role: '',
  roleOther: '',
  purposeChecks: REVIEWER_PURPOSE_TAGS.map(() => false),
  purposeOtherChecked: false,
  purposeOther: '',
  notes: '',
};

/** The request body for the API, from the form's answers. */
export function toSessionInput(values: ReviewerFormValues) {
  const visitorRole = (
    values.role === REVIEWER_OTHER_VALUE ? values.roleOther : values.role
  ).trim();
  const purposeTags = REVIEWER_PURPOSE_TAGS.filter(
    (_, index) => values.purposeChecks[index] === true,
  ) as string[];
  if (values.purposeOtherChecked) purposeTags.push(values.purposeOther.trim());
  const notes = values.notes.trim();
  return { visitorRole, purposeTags, ...(notes === '' ? {} : { notes }) };
}

const ROLE_OPTIONS = [
  ...REVIEWER_VISITOR_ROLES.map((role) => ({ value: role, label: role })),
  { value: REVIEWER_OTHER_VALUE, label: copy.role.other },
];

/**
 * Three-step "Reviewer access" dialog: role, purposes, notes + Turnstile.
 * The session request goes from the browser to cms-api; the reviewer token
 * is held by the web session in memory (D14). Content unmounts on close, so
 * every opening starts clean.
 */
export function ReviewerAccessDialog({
  open,
  onOpenChange,
  siteKey,
  api = defaultApi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteKey: string;
  /** Replaced in tests. */
  api?: ReviewerApi;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ReviewerFlow
          siteKey={siteKey}
          api={api}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReviewerFlow({
  siteKey,
  api,
  onClose,
}: {
  siteKey: string;
  api: ReviewerApi;
  onClose: () => void;
}) {
  const session = useWebSession();
  const [step, setStep] = useState(0);
  const [alert, setAlert] = useState<ReviewerAlert | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);
  const [scriptFailed, setScriptFailed] = useState(false);

  const form = useForm<ReviewerFormValues>({
    defaultValues: DEFAULT_VALUES,
    mode: 'onTouched',
    shouldUnregister: false,
  });
  const role = useWatch({ control: form.control, name: 'role' });
  const otherPurpose = useWatch({
    control: form.control,
    name: 'purposeOtherChecked',
  });
  const notesLength = useWatch({ control: form.control, name: 'notes' }).length;

  const start = useMutation({
    mutationFn: async (turnstileToken: string) => {
      const created = await api.createSession({
        ...toSessionInput(form.getValues()),
        turnstileToken,
      });
      await session.startReviewerSession(created.accessToken);
    },
    onSuccess: onClose,
    onError: (cause) => {
      const next = reviewerAlertOf(apiFailureOf(cause));
      setAlert(next);
      if (next.resetChallenge) {
        // A Turnstile token works once.
        setToken(null);
        setChallengeKey((key) => key + 1);
      }
    },
  });

  const advance = async () => {
    const fields = STEP_FIELDS[step] ?? [];
    if (await form.trigger([...fields] as (keyof ReviewerFormValues)[])) {
      setStep((current) => current + 1);
    }
  };

  const submitLast = form.handleSubmit(() => {
    setAlert(null);
    if (token === null) {
      setTokenError(copy.turnstile.required);
      return;
    }
    setTokenError(null);
    start.mutate(token);
  });

  // Enter on an earlier step moves on; only the last step submits.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < LAST_STEP) void advance();
    else void submitLast();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <FormProvider {...form}>
        <form noValidate onSubmit={onSubmit} className="grid gap-4">
          <p className="m-0 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {copy.stepLabel(step + 1, STEP_FIELDS.length)}
            </span>
            {' - '}
            <span className="font-medium text-foreground">
              {[copy.steps.role, copy.steps.purposes, copy.steps.notes][step]}
            </span>
          </p>
          {alert !== null ? (
            <FormAlert tone={alert.tone}>{alert.message}</FormAlert>
          ) : null}

          <div hidden={step !== 0} className="grid gap-4">
            <SelectInput<ReviewerFormValues>
              name="role"
              label={copy.role.label}
              placeholder={copy.role.placeholder}
              options={ROLE_OPTIONS}
              rules={{ required: copy.validation.roleRequired }}
            />
            {role === REVIEWER_OTHER_VALUE ? (
              <TextInput<ReviewerFormValues>
                name="roleOther"
                label={copy.role.otherLabel}
                maxLength={limits.VISITOR_ROLE_MAX_LENGTH}
                rules={{
                  validate: (value) =>
                    String(value).trim() !== '' ||
                    copy.validation.roleOtherRequired,
                }}
              />
            ) : null}
          </div>

          <fieldset hidden={step !== 1} className="m-0 grid gap-3 border-0 p-0">
            <legend className="mb-1 p-0 text-sm font-medium">
              {copy.purposes.legend}
            </legend>
            <p className="m-0 text-sm text-muted-foreground">
              {copy.purposes.hint}
            </p>
            {REVIEWER_PURPOSE_TAGS.map((tag, index) => (
              <CheckboxInput<ReviewerFormValues>
                key={tag}
                name={`purposeChecks.${index}`}
                label={tag}
              />
            ))}
            <CheckboxInput<ReviewerFormValues>
              name="purposeOtherChecked"
              label={copy.purposes.other}
            />
            {otherPurpose ? (
              <TextInput<ReviewerFormValues>
                name="purposeOther"
                label={copy.purposes.otherLabel}
                maxLength={limits.PURPOSE_TAG_MAX_LENGTH}
                rules={{
                  validate: (value) =>
                    String(value).trim() !== '' ||
                    copy.validation.purposeOtherRequired,
                }}
              />
            ) : null}
          </fieldset>

          <div hidden={step !== LAST_STEP} className="grid gap-4">
            <TextAreaInput<ReviewerFormValues>
              name="notes"
              label={copy.notes.label}
              description={`${copy.notes.hint(limits.NOTES_MAX_LENGTH)} ${copy.notes.count(notesLength, limits.NOTES_MAX_LENGTH)}`}
              rows={4}
              rules={{
                maxLength: {
                  value: limits.NOTES_MAX_LENGTH,
                  message: copy.validation.notesTooLong(
                    limits.NOTES_MAX_LENGTH,
                  ),
                },
              }}
            />
            {step === LAST_STEP ? (
              <div className="grid gap-1">
                <TurnstileWidget
                  siteKey={siteKey}
                  key={challengeKey}
                  failed={scriptFailed}
                  onFailed={() => setScriptFailed(true)}
                  onToken={(value) => {
                    setToken(value);
                    setTokenError(null);
                  }}
                  onExpired={() => {
                    setToken(null);
                    setTokenError(copy.turnstile.expired);
                  }}
                />
                {tokenError !== null ? (
                  <p role="alert" className="text-sm text-destructive-strong">
                    {tokenError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Enter must move on even with two text inputs in the form. */}
          {step < LAST_STEP ? (
            <button type="submit" hidden>
              {copy.next}
            </button>
          ) : null}
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {step === 0 ? (
              <Button type="button" variant="secondary" onClick={onClose}>
                {copy.cancel}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={start.isPending}
                onClick={() => {
                  // The challenge unmounts with the last step.
                  setToken(null);
                  setTokenError(null);
                  setStep((current) => current - 1);
                }}
              >
                {copy.back}
              </Button>
            )}
            {step < LAST_STEP ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => void advance()}
              >
                {copy.next}
              </Button>
            ) : (
              <Button type="submit" variant="primary" loading={start.isPending}>
                {copy.submit}
              </Button>
            )}
          </div>
        </form>
      </FormProvider>
    </>
  );
}
