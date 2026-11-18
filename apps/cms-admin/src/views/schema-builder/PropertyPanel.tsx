import { Card, Checkbox, Field, Input, Label, NativeSelect } from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';

import { FIELD_TYPES } from './FieldTypes.registry';
import type { LocatedError } from './SchemaJson.rules';
import {
  typeChangeRefusal,
  type OptionalFieldKey,
  type SchemaField,
  type SchemaTree,
  type TypeChangeRefusal,
} from './SchemaTree.reducer';

const WIDTH_VALUES = ['1/3', '1/2', 'full'] as const;

interface PropertyPanelProps {
  tree: SchemaTree;
  /** The selected field; `null` shows the empty hint. */
  field: SchemaField | null;
  /** Errors of the current tree only; none while a newer check runs. */
  errors: readonly LocatedError[];
  onSetKey: (
    fieldId: string,
    key: 'name' | OptionalFieldKey,
    value: string | boolean | undefined,
  ) => void;
  onChangeType: (fieldId: string, fieldType: string) => void;
}

/** The selected field's properties, each control with the errors that point at its key (SB-8). */
export function PropertyPanel({ tree, field, errors, onSetKey, onChangeType }: PropertyPanelProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder;
  const text = copy.property;
  const errorsOf = (key: string) =>
    field === null
      ? undefined
      : errors
          .filter((error) => error.fieldId === field.id && error.key === key)
          .map((error) => error.message)
          .join(' ') || undefined;

  if (field === null) {
    return (
      <Card className="grid gap-2">
        <h2 className="m-0 text-base font-semibold">{text.heading}</h2>
        <p className="m-0 text-sm text-muted-foreground">{text.empty}</p>
      </Card>
    );
  }

  const isComponent = field.type === 'component';
  const refusals = new Map<string, TypeChangeRefusal>();
  for (const { type } of FIELD_TYPES) {
    const refusal = typeChangeRefusal(tree, field.id, type);
    if (refusal !== undefined) refusals.set(type, refusal);
  }
  const shownRefusal = [...refusals.values()][0];
  const widthValues: readonly string[] =
    field.width === undefined || (WIDTH_VALUES as readonly string[]).includes(field.width)
      ? WIDTH_VALUES
      : [...WIDTH_VALUES, field.width];
  const setText = (key: 'displayName' | 'component', value: string) =>
    onSetKey(field.id, key, value === '' ? undefined : value);
  const flag = (key: 'required' | 'sensitive' | 'repeatable', label: string, hint?: string) => (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`schema-field-${key}`}
          checked={field[key] === true}
          onCheckedChange={(checked) =>
            onSetKey(field.id, key, checked === true ? true : undefined)
          }
        />
        <Label htmlFor={`schema-field-${key}`}>{label}</Label>
      </div>
      {hint === undefined ? null : <p className="m-0 text-sm text-muted-foreground">{hint}</p>}
      {errorsOf(key) === undefined ? null : (
        <p className="m-0 text-sm text-destructive-strong">{errorsOf(key)}</p>
      )}
    </div>
  );

  return (
    <Card key={field.id} className="grid gap-4">
      <h2 className="m-0 text-base font-semibold">{text.heading}</h2>
      <Field label={text.name} error={errorsOf('name')}>
        {(control) => (
          <Input
            {...control}
            value={field.name}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onSetKey(field.id, 'name', event.target.value)}
          />
        )}
      </Field>
      <Field label={text.displayName} error={errorsOf('displayName')}>
        {(control) => (
          <Input
            {...control}
            value={field.displayName ?? ''}
            onChange={(event) => setText('displayName', event.target.value)}
          />
        )}
      </Field>
      <Field
        label={text.type}
        description={shownRefusal === undefined ? undefined : text.typeRefusal[shownRefusal]}
        error={errorsOf('type')}
      >
        {(control) => (
          <NativeSelect
            {...control}
            value={field.type}
            onChange={(event) => onChangeType(field.id, event.target.value)}
          >
            {FIELD_TYPES.map(({ type, copyKey }) => (
              <option key={type} value={type} disabled={refusals.has(type)}>
                {copy.fieldTypes[copyKey]}
              </option>
            ))}
            {FIELD_TYPES.some(({ type }) => type === field.type) ? null : (
              <option value={field.type}>{field.type}</option>
            )}
          </NativeSelect>
        )}
      </Field>
      {flag('required', text.required)}
      {flag('sensitive', text.sensitive, text.sensitiveHint)}
      {isComponent ? (
        <>
          <Field
            label={text.component}
            description={text.componentHint}
            error={errorsOf('component')}
          >
            {(control) => (
              <Input
                {...control}
                value={field.component ?? ''}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setText('component', event.target.value)}
              />
            )}
          </Field>
          {flag('repeatable', text.repeatable)}
        </>
      ) : (
        <Field label={text.width} error={errorsOf('width')}>
          {(control) => (
            <NativeSelect
              {...control}
              value={field.width ?? ''}
              onChange={(event) =>
                onSetKey(
                  field.id,
                  'width',
                  event.target.value === '' ? undefined : event.target.value,
                )
              }
            >
              <option value="">{text.widthUnset}</option>
              {widthValues.map((value) => (
                <option key={value} value={value}>
                  {value in text.widthOptions
                    ? text.widthOptions[value as keyof typeof text.widthOptions]
                    : value}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      )}
    </Card>
  );
}
