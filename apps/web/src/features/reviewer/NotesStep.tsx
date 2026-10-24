import { TextAreaInput } from '@abyss/form-commons';
import type { ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { COPY } from '../../config/copy.constants';
import { REVIEWER_INPUT_LIMITS } from '../../config/reviewer.constants';
import type { ReviewerFormValues } from './reviewer-form';

const copy = COPY.reviewer;
const limits = REVIEWER_INPUT_LIMITS;

/** `children` is the human-check area shown under the notes field. */
export function NotesStep({
  isActive,
  children,
}: {
  isActive: boolean;
  children?: ReactNode;
}) {
  const { control } = useFormContext<ReviewerFormValues>();
  const notesLength = useWatch({ control, name: 'notes' }).length;

  return (
    <div hidden={!isActive} className="grid gap-4">
      <TextAreaInput<ReviewerFormValues>
        name="notes"
        label={copy.notes.label}
        description={`${copy.notes.hint(limits.NOTES_MAX_LENGTH)} ${copy.notes.count(notesLength, limits.NOTES_MAX_LENGTH)}`}
        rows={4}
        rules={{
          maxLength: {
            value: limits.NOTES_MAX_LENGTH,
            message: copy.validation.notesTooLong(limits.NOTES_MAX_LENGTH),
          },
        }}
      />
      {children}
    </div>
  );
}
