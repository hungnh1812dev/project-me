import { useEffect, useRef, useState } from 'react';

import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Field } from '@repo/ui/form/Field';

import { useUpdateProfile } from '@/features/settings/hooks/useUpdateProfile';
import { validateProfileName } from '@/features/settings/validation';

export interface EditNameFormProps {
  /** The current name, prefilled. */
  name: string;
  /** Called after Cancel, with nothing saved. */
  onCancel: () => void;
  /** Called after U2 succeeds. */
  onSaved: () => void;
}

/**
 * The inline name form on the profile card (AC-39, AC-40). Name is required, trimmed and at most
 * 100 characters; validation runs on submit, then on every change. Save sends exactly `{ name }`. A
 * server error shows as an alert and the typed value stays. There is no password field (AC-41).
 */
export const EditNameForm: React.FC<EditNameFormProps> = ({ name, onCancel, onSaved }) => {
  const update = useUpdateProfile();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const change = (next: string) => {
    setValue(next);
    if (submitted) setError(validateProfileName(next));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (update.isPending) return;
    const found = validateProfileName(value);
    setSubmitted(true);
    setError(found);
    if (found) return;
    // The failure is shown from the mutation's `error`.
    update.mutateAsync({ name: value.trim() }).then(onSaved, () => {});
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Name" hideLabel required error={error}>
        <Input
          ref={inputRef}
          value={value}
          onChange={(event) => change(event.target.value)}
          autoComplete="name"
        />
      </Field>
      {update.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {update.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={update.isPending}>
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={update.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
EditNameForm.displayName = 'EditNameForm';
