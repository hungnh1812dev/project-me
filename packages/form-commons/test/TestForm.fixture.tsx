import type { ReactNode } from 'react';
import {
  FormProvider,
  type FieldValues,
  type UseFormProps,
  useForm,
} from 'react-hook-form';

import { Button } from '@/components/ui/Button';

/** Test helper: a form with a Save button around the input under test. */
export function TestForm<T extends FieldValues>({
  options,
  onValid = () => undefined,
  children,
}: {
  options?: UseFormProps<T>;
  onValid?: (values: T) => void;
  children: ReactNode;
}) {
  const form = useForm<T>(options);
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={(event) => void form.handleSubmit(onValid)(event)}
      >
        {children}
        <Button type="submit" variant="primary">
          Save
        </Button>
      </form>
    </FormProvider>
  );
}
