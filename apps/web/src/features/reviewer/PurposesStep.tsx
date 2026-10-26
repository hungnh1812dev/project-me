import { CheckboxInput, TextInput } from '@abyss/form-commons';
import { useFormContext, useWatch } from 'react-hook-form';

import { COPY } from '../../config/Copy.constants';
import {
  REVIEWER_INPUT_LIMITS,
  REVIEWER_PURPOSE_TAGS,
} from '../../config/Reviewer.constants';
import type { ReviewerFormValues } from './Reviewer.form';

const copy = COPY.reviewer;

export function PurposesStep({ isActive }: { isActive: boolean }) {
  const { control } = useFormContext<ReviewerFormValues>();
  const isOtherPurposeChecked = useWatch({
    control,
    name: 'purposeOtherChecked',
  });

  return (
    <fieldset hidden={!isActive} className="m-0 grid gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-medium">
        {copy.purposes.legend}
      </legend>
      <p className="m-0 text-sm text-muted-foreground">{copy.purposes.hint}</p>
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
      {isOtherPurposeChecked ? (
        <TextInput<ReviewerFormValues>
          name="purposeOther"
          label={copy.purposes.otherLabel}
          maxLength={REVIEWER_INPUT_LIMITS.PURPOSE_TAG_MAX_LENGTH}
          rules={{
            validate: (value) =>
              String(value).trim() !== '' ||
              copy.validation.purposeOtherRequired,
          }}
        />
      ) : null}
    </fieldset>
  );
}
