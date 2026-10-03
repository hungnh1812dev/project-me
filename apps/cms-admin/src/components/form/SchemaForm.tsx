import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, Lock } from 'lucide-react';
import { FormProvider, useForm } from 'react-hook-form';

import { cn } from '@repo/ui/lib/cn';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { isApiError } from '@/core/api/apiError';
import { widthClass } from '@/features/content/schema';
import { toDocumentData, toFormValues, type FormValues } from '@/features/content/schemaForm';
import type { DocumentData, FieldDefinition } from '@/features/content/types';
import { LiveRegion } from '@/features/settings/components/LiveRegion';
import { useAnnouncer } from '@/features/settings/components/useAnnouncer';

import { SchemaField } from './SchemaField';
import { SchemaFormContext } from './schemaFormContext';

export interface SchemaFormProps {
  /** The form id. A submit button outside the form points at it with `form={id}`. */
  id: string;
  fields: readonly FieldDefinition[];
  /** The saved document (or component value), or `null` for a new one. Read once, on mount. */
  document: DocumentData | null;
  /**
   * Saves the schema data and resolves with the saved document, which becomes the new clean
   * baseline. A rejection is shown in an alert at the top of the form, and the typed values stay.
   */
  onSubmit: (data: DocumentData) => Promise<DocumentData>;
  /** Every control is read-only, a notice shows `readOnlyReason`, and submitting does nothing. */
  readOnly?: boolean;
  readOnlyReason?: string;
  /** Called with `formState.isDirty` whenever it changes (and once on mount). */
  onDirtyChange?: (dirty: boolean) => void;
}

const FALLBACK_READ_ONLY = "You don't have permission to edit this entry.";
const NO_ACCESS = "You don't have access to do this.";
const SAVE_FAILED = "Couldn't save. Try again.";

/** The messages a failed save shows: every 400 message, "no access" for a 403, else the error. */
function saveErrorMessages(error: unknown): string[] {
  if (!isApiError(error)) return [SAVE_FAILED];
  if (error.status === 403) return [NO_ACCESS];
  return error.messages;
}

/**
 * The schema-driven document form (D3). react-hook-form holds the values (`toFormValues` on mount,
 * `mode: 'onTouched'`), and a valid submit sends `toDocumentData`. A submit with errors focuses the
 * first invalid field. After a save the form resets to the saved document, so it is clean again.
 */
export const SchemaForm: React.FC<SchemaFormProps> = ({
  id,
  fields,
  document,
  onSubmit,
  readOnly = false,
  readOnlyReason,
  onDirtyChange,
}) => {
  const form = useForm<FormValues>({
    defaultValues: toFormValues(fields, document),
    mode: 'onTouched',
  });
  const { isDirty } = form.formState;
  const [saveErrors, setSaveErrors] = useState<string[] | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const { message, announce } = useAnnouncer();
  const context = useMemo(() => ({ readOnly, announce }), [readOnly, announce]);

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);
  useEffect(() => {
    if (saveErrors) alertRef.current?.focus();
  }, [saveErrors]);

  const submit = form.handleSubmit(async (values) => {
    if (readOnly) return;
    try {
      const saved = await onSubmit(toDocumentData(fields, values));
      setSaveErrors(null);
      form.reset(toFormValues(fields, saved));
    } catch (error) {
      setSaveErrors(saveErrorMessages(error));
    }
  });

  return (
    <FormProvider {...form}>
      <SchemaFormContext value={context}>
        <div className="flex flex-col gap-4">
          {readOnly && (
            <Alert role="note">
              <Lock aria-hidden="true" />
              <AlertTitle>Read only</AlertTitle>
              <AlertDescription>{readOnlyReason ?? FALLBACK_READ_ONLY}</AlertDescription>
            </Alert>
          )}
          {saveErrors && (
            <Alert ref={alertRef} variant="destructive" tabIndex={-1} className="outline-none">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>The entry wasn't saved</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {saveErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <form
            id={id}
            aria-label="Fields"
            noValidate
            onSubmit={(event) => void submit(event)}
            className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-6"
          >
            {fields.map((field) => (
              <SchemaField
                key={field.name}
                field={field}
                name={field.name}
                className={cn('min-w-0', widthClass(field.width))}
              />
            ))}
          </form>
          <LiveRegion message={message} />
        </div>
      </SchemaFormContext>
    </FormProvider>
  );
};
SchemaForm.displayName = 'SchemaForm';
