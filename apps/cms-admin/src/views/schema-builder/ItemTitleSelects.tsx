import { Field, NativeSelect } from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';

import { titleFieldCandidates } from './FieldTypes.registry';
import type { FieldKeyValue, SchemaField } from './SchemaTree.reducer';

export interface ItemTitleSelectsProps {
  /** The repeatable component being edited. */
  field: SchemaField;
  /** Messages that point at the given key of this field, joined; undefined when none. */
  errorsOf: (key: string) => string | undefined;
  onSetKey: (fieldId: string, key: 'titleField' | 'subtitleField', value: FieldKeyValue) => void;
}

/** The item title and subtitle selects of a repeatable component (SB-8, CM-14): direct text-like children, each applied at once. */
export function ItemTitleSelects({ field, errorsOf, onSetKey }: ItemTitleSelectsProps) {
  const text = useScreenText('schemaBuilder').schemaBuilder.property;
  const candidates = titleFieldCandidates(field);

  const select = (key: 'titleField' | 'subtitleField', label: string) => {
    const current = field[key];
    const isSubtitle = key === 'subtitleField';
    const choices = candidates
      .filter((child) => !(isSubtitle && child.name === field.titleField))
      .map((child) => ({
        value: child.name,
        label:
          child.displayName === undefined ? child.name : `${child.displayName} (${child.name})`,
      }));
    // A reference to a deleted or retyped child stays visible so its validator error has a subject.
    if (current !== undefined && !choices.some((choice) => choice.value === current)) {
      choices.push({ value: current, label: current });
    }
    return (
      <Field label={label} error={errorsOf(key)}>
        {(control) => (
          <NativeSelect
            {...control}
            value={current ?? ''}
            disabled={isSubtitle && field.titleField === undefined}
            onChange={(event) =>
              onSetKey(field.id, key, event.target.value === '' ? undefined : event.target.value)
            }
          >
            <option value="">{text.noItemTitle}</option>
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
    );
  };

  return (
    <>
      {select('titleField', text.itemTitleField)}
      {select('subtitleField', text.itemSubtitleField)}
    </>
  );
}
