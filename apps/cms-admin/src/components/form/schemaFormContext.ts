import { createContext, useContext } from 'react';
import { get, useFormState } from 'react-hook-form';

/** Shared by every field of one `SchemaForm`. */
export interface SchemaFormContextValue {
  /** Every control is read-only or disabled (AC-14). */
  readOnly: boolean;
  /** Puts a polite message in the form's live region, such as "Gallery item 2 removed." */
  announce: (text: string) => void;
}

export const SchemaFormContext = createContext<SchemaFormContextValue>({
  readOnly: false,
  announce: () => {},
});

/** Whether the surrounding `SchemaForm` is read-only. */
export function useSchemaFormReadOnly(): boolean {
  return useContext(SchemaFormContext).readOnly;
}

/** Announces a change made inside the surrounding `SchemaForm`. */
export function useSchemaFormAnnounce(): (text: string) => void {
  return useContext(SchemaFormContext).announce;
}

/** The validation message of the field at `name` (a dotted path), or `undefined`. */
export function useFieldError(name: string): string | undefined {
  const { errors } = useFormState({ name });
  const message: unknown = get(errors, name)?.message;
  return typeof message === 'string' && message !== '' ? message : undefined;
}
