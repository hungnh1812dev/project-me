import { useEffect, useRef } from 'react';
import { useScreenText } from '@configs/locales';
import { FormProvider, useForm, useWatch } from 'react-hook-form';

import { adapterFor } from './Field.registry';
import type { FieldNode } from './FieldTree.rules';

const VALUE_NAME = 'value';

export interface FieldValueInputProps {
  /** The field the input edits: its type, label and enumeration options. */
  node: Pick<FieldNode, 'type' | 'label' | 'options'>;
  /** Current value in API value form; `undefined` is empty. */
  value: unknown;
  /** Called with the API value after each edit; `undefined` when emptied. */
  onChange: (value: unknown) => void;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The document editor's input for one field, controlled in API value form so
 * another screen can reuse it without an input of its own.
 */
export function FieldValueInput({ node, value, onChange }: FieldValueInputProps) {
  const copy = useScreenText('content').content;
  const adapter = adapterFor(node.type);
  const form = useForm({ defaultValues: { [VALUE_NAME]: adapter.toForm(value) } });
  const formValue: unknown = useWatch({ control: form.control, name: VALUE_NAME });
  const lastSent = useRef<unknown>(value);

  useEffect(() => {
    if (same(value, lastSent.current)) return;
    lastSent.current = value;
    form.setValue(VALUE_NAME, adapter.toForm(value));
  }, [value, adapter, form]);

  useEffect(() => {
    const next = adapter.toApi(formValue) ?? undefined;
    if (same(next, lastSent.current)) return;
    lastSent.current = next;
    onChange(next);
  }, [formValue, adapter, onChange]);

  return (
    <FormProvider {...form}>
      {adapter.render({ name: VALUE_NAME, label: node.label, options: node.options, copy })}
    </FormProvider>
  );
}
