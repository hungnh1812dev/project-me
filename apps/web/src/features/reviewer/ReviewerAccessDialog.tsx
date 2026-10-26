'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FormAlert,
} from '@abyss/form-commons';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { COPY } from '../../config/Copy.constants';
import { apiFailureOf } from '../../lib/ApiFailure.errors';
import { useWebSession } from '../session';
import { NotesStep } from './NotesStep';
import { PurposesStep } from './PurposesStep';
import { type ReviewerApi } from './Reviewer.api';
import { reviewerApi } from './Reviewer.queries';
import { reviewerAlertOf, type ReviewerAlert } from './ReviewerError.errors';
import {
  DEFAULT_VALUES,
  LAST_STEP,
  STEP_FIELDS,
  toSessionInput,
  type ReviewerFormValues,
} from './Reviewer.form';
import { RoleStep } from './RoleStep';
import { useHumanCheck } from './useHumanCheck.state';

const copy = COPY.reviewer;
const STEP_TITLES = [copy.steps.role, copy.steps.purposes, copy.steps.notes];

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
  api = reviewerApi,
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
  const humanCheck = useHumanCheck(siteKey);

  const form = useForm<ReviewerFormValues>({
    defaultValues: DEFAULT_VALUES,
    mode: 'onTouched',
    shouldUnregister: false,
  });

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
      if (next.shouldResetChallenge) humanCheck.renewChallenge();
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
    const token = humanCheck.requireToken();
    if (token !== null) start.mutate(token);
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
              {STEP_TITLES[step]}
            </span>
          </p>
          {alert !== null ? (
            <FormAlert tone={alert.tone}>{alert.message}</FormAlert>
          ) : null}

          <RoleStep isActive={step === 0} />
          <PurposesStep isActive={step === 1} />
          <NotesStep isActive={step === LAST_STEP}>
            {step === LAST_STEP ? humanCheck.field : null}
          </NotesStep>

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
                  humanCheck.discard();
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
