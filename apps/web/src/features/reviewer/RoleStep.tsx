import { SelectInput, TextInput } from '@abyss/form-commons';
import { useFormContext, useWatch } from 'react-hook-form';

import { COPY } from '../../config/copy.constants';
import {
  REVIEWER_INPUT_LIMITS,
  REVIEWER_OTHER_VALUE,
} from '../../config/reviewer.constants';
import { ROLE_OPTIONS, type ReviewerFormValues } from './reviewer-form';

const copy = COPY.reviewer;

export function RoleStep({ isActive }: { isActive: boolean }) {
  const { control } = useFormContext<ReviewerFormValues>();
  const role = useWatch({ control, name: 'role' });

  return (
    <div hidden={!isActive} className="grid gap-4">
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
          maxLength={REVIEWER_INPUT_LIMITS.VISITOR_ROLE_MAX_LENGTH}
          rules={{
            validate: (value) =>
              String(value).trim() !== '' || copy.validation.roleOtherRequired,
          }}
        />
      ) : null}
    </div>
  );
}
