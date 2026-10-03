import { createContext, useContext } from 'react';
import { get, useFormState } from 'react-hook-form';

/** Shared by every field of one `SchemaForm`. */
export interface SchemaFormContextValue {
  /** Every control is read-only or disabled (AC-14). */
  readOnly: boolean;
}

export const SchemaFormContext = createContext<SchemaFormContextValue>({ readOnly: false });

/** Whether the surrounding `SchemaForm` is read-only. */
export function useSchemaFormReadOnly(): boolean {
  return useContext(SchemaFormContext).readOnly;
}

/** The validation message of the field at `name` (a dotted path), or `undefined`. */
export function useFieldError(name: string): string | undefined {
  const { errors } = useFormState({ name });
  const message: unknown = get(errors, name)?.message;
  return typeof message === 'string' && message !== '' ? message : undefined;
}
