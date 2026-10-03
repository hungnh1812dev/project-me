import { lazy, Suspense, useId, useRef, useState } from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import { Controller, useFormContext, useFormState } from 'react-hook-form';

import { useSchemaFormReadOnly } from '@/components/form/schemaFormContext';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUND_TRIP_WARNING } from '@/features/content/richtext';
import { cn } from '@/utils/cn';

import type { RichTextEditorHandle } from './RichTextEditor';

// The only import of the editor: Tiptap and ProseMirror stay in this lazy chunk (AC-11).
const RichTextEditor = lazy(() => import('./RichTextEditor'));

export interface RichTextFieldProps {
  label: string;
  name: string;
  className?: string;
}

/** Holds the editor's place while its chunk loads. */
const EditorSkeleton: React.FC = () => (
  <div
    role="status"
    aria-label="Loading editor"
    className="flex flex-col gap-2 rounded-md border border-input p-3"
  >
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-24 w-full" />
  </div>
);
EditorSkeleton.displayName = 'EditorSkeleton';

/**
 * A `richtext` field (D1, D2): the lazy Tiptap editor behind a react-hook-form `Controller`,
 * holding HTML. When the loaded HTML loses markup in the editor, the field warns, and the
 * editor's version becomes the field's clean value, so the next save drops that markup.
 */
export const RichTextField: React.FC<RichTextFieldProps> = ({ label, name, className }) => {
  const { control, resetField } = useFormContext();
  const { isSubmitSuccessful, submitCount } = useFormState({ control });
  const readOnly = useSchemaFormReadOnly();
  const id = useId();
  const labelId = `${id}-label`;
  const warningId = `${id}-warning`;
  // The submit count when the editor reported lost markup, or `null` when it didn't.
  const [lossyAt, setLossyAt] = useState<number | null>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  // Once a later save has gone through, the markup the warning was about is gone.
  const lossy = lossyAt !== null && !(isSubmitSuccessful && submitCount > lossyAt);

  return (
    <div data-slot="field" className={cn('flex flex-col gap-1.5', className)}>
      <Label id={labelId} onClick={() => editorRef.current?.focus()}>
        {label}
      </Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Suspense fallback={<EditorSkeleton />}>
            <RichTextEditor
              ref={(handle: RichTextEditorHandle | null) => {
                editorRef.current = handle;
                field.ref(handle);
              }}
              id={`${id}-editor`}
              labelId={labelId}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              onRoundTripLoss={(html) => {
                setLossyAt(submitCount);
                resetField(name, { defaultValue: html });
              }}
              readOnly={readOnly}
              aria-describedby={lossy ? warningId : undefined}
            />
          </Suspense>
        )}
      />
      {lossy && (
        <p id={warningId} className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-destructive"
          />
          {ROUND_TRIP_WARNING}
        </p>
      )}
    </div>
  );
};
RichTextField.displayName = 'RichTextField';
