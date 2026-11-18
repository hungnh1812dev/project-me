import { useRef } from 'react';
import {
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  Label,
  NativeSelect,
} from '@abyss/form-commons';
import { Modal, ModalActions } from '@components/Modal';
import { useScreenText } from '@configs/locales';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';

import { paletteItemLabel, paletteItems, variantOf } from './FieldTypes.registry';
import type { LocatedError } from './SchemaJson.rules';
import {
  typeChangeRefusal,
  type FieldKeyValue,
  type OptionalFieldKey,
  type SchemaField,
  type SchemaTree,
  type TypeChangeRefusal,
} from './SchemaTree.reducer';

const WIDTH_VALUES = ['1/3', '1/2', 'full'] as const;

interface FieldPropertiesDialogProps {
  tree: SchemaTree;
  field: SchemaField;
  /** Errors of the current tree only; none while a newer check runs. */
  errors: readonly LocatedError[];
  onSetKey: (fieldId: string, key: 'name' | OptionalFieldKey, value: FieldKeyValue) => void;
  onChangeType: (fieldId: string, fieldType: string) => void;
  onChangeVariant: (fieldId: string, variant: string) => void;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

interface EnumOptionsEditorProps {
  options: readonly string[];
  error: string | undefined;
  /** Messages by option position, for errors that point at one entry. */
  entryErrors: ReadonlyMap<number, string>;
  onChange: (options: readonly string[]) => void;
}

/** One text input per option with remove, move up, move down and Add option; each change is the new list. */
function EnumOptionsEditor({ options, error, entryErrors, onChange }: EnumOptionsEditorProps) {
  const text = useScreenText('schemaBuilder').schemaBuilder.property.options;
  const container = useRef<HTMLFieldSetElement>(null);
  const replaceAt = (index: number, value: string) =>
    onChange(options.map((option, position) => (position === index ? value : option)));
  const swap = (index: number, other: number) => {
    const next = [...options];
    [next[index], next[other]] = [next[other]!, next[index]!];
    onChange(next);
  };
  const focusOptionAt = (index: number) =>
    requestAnimationFrame(() =>
      container.current?.querySelector<HTMLElement>(`[data-option-index="${index}"]`)?.focus(),
    );
  return (
    <fieldset ref={container} className="m-0 grid gap-2 border-0 p-0">
      <legend className="p-0 text-sm font-medium">{text.label}</legend>
      {options.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{text.empty}</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {options.map((option, index) => (
            // Options are plain text with no id; the position is the identity.
            <li key={index} className="grid gap-1">
              <div className="flex items-center gap-1">
                <Input
                  aria-label={text.option(index + 1)}
                  aria-invalid={entryErrors.has(index) || undefined}
                  data-option-index={index}
                  value={option}
                  autoComplete="off"
                  onChange={(event) => replaceAt(index, event.target.value)}
                />
                <IconButton
                  type="button"
                  variant="ghost"
                  label={text.moveUp(index + 1)}
                  disabled={index === 0}
                  onClick={() => swap(index, index - 1)}
                >
                  <ArrowUp aria-hidden="true" />
                </IconButton>
                <IconButton
                  type="button"
                  variant="ghost"
                  label={text.moveDown(index + 1)}
                  disabled={index === options.length - 1}
                  onClick={() => swap(index, index + 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </IconButton>
                <IconButton
                  type="button"
                  variant="ghost"
                  label={text.remove(index + 1)}
                  onClick={() => onChange(options.filter((_, position) => position !== index))}
                >
                  <Trash2 aria-hidden="true" />
                </IconButton>
              </div>
              {entryErrors.has(index) ? (
                <p role="alert" className="m-0 text-sm text-destructive-strong">
                  {entryErrors.get(index)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button
          type="button"
          onClick={() => {
            onChange([...options, '']);
            focusOptionAt(options.length);
          }}
        >
          {text.add}
        </Button>
      </div>
      {error === undefined ? null : (
        <p role="alert" className="m-0 text-sm text-destructive-strong">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** The field's properties in a popup; each change applies at once, each control shows the errors that point at its key (SB-5, SB-8). */
export function FieldPropertiesDialog({
  tree,
  field,
  errors,
  onSetKey,
  onChangeType,
  onChangeVariant,
  onClose,
  onCloseAutoFocus,
}: FieldPropertiesDialogProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder;
  const text = copy.property;
  const optionErrors = new Map(
    errors
      .filter(
        (error) =>
          error.fieldId === field.id && error.key === 'options' && error.itemIndex !== undefined,
      )
      .map((error) => [error.itemIndex as number, error.message] as const),
  );
  const errorsOf = (key: string) =>
    errors
      .filter(
        (error) => error.fieldId === field.id && error.key === key && error.itemIndex === undefined,
      )
      .map((error) => error.message)
      .join(' ') || undefined;

  const isComponent = field.type === 'component';
  const grouped = variantOf(field);
  const items = paletteItems();
  const itemOf = (value: string) =>
    items.find((item) => (item.group ?? item.defaultType) === value);
  const currentItemValue = grouped?.group.key ?? field.type;
  const refusals = new Map<string, TypeChangeRefusal>();
  for (const item of items) {
    const refusal = typeChangeRefusal(tree, field.id, item.defaultType);
    if (refusal !== undefined) refusals.set(item.group ?? item.defaultType, refusal);
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
    <Modal
      title={field.displayName || field.name || text.heading}
      description={text.description}
      onClose={onClose}
      onCloseAutoFocus={onCloseAutoFocus}
      isDismissedOutside
    >
      <div className="grid gap-4">
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
              value={currentItemValue}
              onChange={(event) => {
                const item = itemOf(event.target.value);
                if (item !== undefined) onChangeType(field.id, item.defaultType);
              }}
            >
              {items.map((item) => {
                const value = item.group ?? item.defaultType;
                return (
                  <option key={value} value={value} disabled={refusals.has(value)}>
                    {paletteItemLabel(item, copy)}
                  </option>
                );
              })}
              {itemOf(currentItemValue) === undefined ? (
                <option value={field.type}>{field.type}</option>
              ) : null}
            </NativeSelect>
          )}
        </Field>
        {grouped === undefined ? null : (
          <Field
            label={grouped.group.key === 'number' ? text.numberType : text.dateType}
            error={errorsOf('unsigned')}
          >
            {(control) => (
              <NativeSelect
                {...control}
                value={grouped.variant.key}
                onChange={(event) => onChangeVariant(field.id, event.target.value)}
              >
                {grouped.group.variants.map((variant) => (
                  <option key={variant.key} value={variant.key}>
                    {copy.fieldVariants[variant.key]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        )}
        {field.type === 'enumeration' ? (
          <EnumOptionsEditor
            options={field.options ?? []}
            error={errorsOf('options')}
            entryErrors={optionErrors}
            onChange={(options) => onSetKey(field.id, 'options', options)}
          />
        ) : null}
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
        <ModalActions>
          <Button type="button" variant="primary" onClick={onClose}>
            {text.done}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}
