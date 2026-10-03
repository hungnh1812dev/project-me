import { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { useSchemaFormAnnounce, useSchemaFormReadOnly } from '@/components/form/schemaFormContext';
import { Button } from '@/components/ui/button';
import { entryHint } from '@/features/content/schema';
import { emptyEntry } from '@/features/content/schemaForm';
import type { FieldDefinition } from '@/features/content/types';
import { cn } from '@/utils/cn';

import { ComponentChildren } from './ComponentField';
import { RepeatableEntry, type EntryAction } from './RepeatableEntry';

export interface RepeatableFieldProps {
  field: FieldDefinition;
  label: string;
  /** The form value path of the array, such as `gallery` or `gallery.0.tags`. */
  name: string;
  className?: string;
}

/** Where focus goes once the entries have re-rendered after a change. */
type FocusRequest =
  | { kind: 'new' }
  | { kind: 'button'; id: string; actions: readonly EntryAction[] }
  | { kind: 'add' };

const FOCUSABLE =
  'input:not([type="hidden"]), textarea, select, button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

const focusFirst = (root: Element | null | undefined, selectors: readonly string[]): void => {
  for (const selector of selectors) {
    const target = root?.querySelector<HTMLElement>(selector);
    if (target) {
      target.focus();
      return;
    }
  }
};

/**
 * A repeatable `component` field (AC-10): `useFieldArray` on the full name path, keyed by RHF's
 * `field.id`, so each entry keeps its controls and values when it moves. Focus moves to the new
 * entry after Add, to the next (else previous) entry or the Add button after Remove, and stays on
 * the moved entry after a move. Every change is announced.
 */
export const RepeatableField: React.FC<RepeatableFieldProps> = ({
  field,
  label,
  name,
  className,
}) => {
  const { control } = useFormContext();
  const { fields: entries, append, remove, move } = useFieldArray({ control, name });
  const values: unknown = useWatch({ control, name });
  const readOnly = useSchemaFormReadOnly();
  const announce = useSchemaFormAnnounce();
  const childFields = field.fields ?? [];
  const entryRefs = useRef(new Map<string, HTMLDivElement>());
  const addRef = useRef<HTMLButtonElement>(null);
  const focusRequest = useRef<FocusRequest | null>(null);
  const itemLabel = (index: number) => `${label} item ${index + 1}`;

  useEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    focusRequest.current = null;
    if (request.kind === 'add') {
      addRef.current?.focus();
      return;
    }
    if (request.kind === 'new') {
      // The new entry is the last one: focus the first control of its fields.
      const last = entries.at(-1);
      const entry = last && entryRefs.current.get(last.id);
      focusFirst(entry?.querySelector(':scope > [data-slot="entry-fields"]'), [FOCUSABLE]);
      return;
    }
    const entry = entryRefs.current.get(request.id);
    focusFirst(
      entry,
      // Only this entry's own buttons, not those of a repeatable nested inside it.
      request.actions.map(
        (action) =>
          `:scope > div > [data-slot="entry-actions"] > [data-action="${action}"]:not([disabled])`,
      ),
    );
  }, [entries]);

  const add = () => {
    append(emptyEntry(childFields), { shouldFocus: false });
    focusRequest.current = { kind: 'new' };
    announce(`${itemLabel(entries.length)} added.`);
  };

  const moveEntry = (from: number, to: number) => {
    const id = entries[from]!.id;
    move(from, to);
    focusRequest.current = {
      kind: 'button',
      id,
      actions: to < from ? ['up', 'down'] : ['down', 'up'],
    };
    announce(`${itemLabel(from)} moved to position ${to + 1}.`);
  };

  const removeEntry = (index: number) => {
    const neighbour = entries[index + 1] ?? entries[index - 1];
    remove(index);
    focusRequest.current = neighbour
      ? { kind: 'button', id: neighbour.id, actions: ['remove'] }
      : { kind: 'add' };
    announce(`${itemLabel(index)} removed.`);
  };

  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-3', className)}>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {entries.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
      {entries.map((entry, index) => (
        <RepeatableEntry
          key={entry.id}
          ref={(element) => {
            if (element) entryRefs.current.set(entry.id, element);
            else entryRefs.current.delete(entry.id);
          }}
          label={itemLabel(index)}
          hint={entryHint(childFields, Array.isArray(values) ? values[index] : undefined)}
          onMoveUp={index > 0 ? () => moveEntry(index, index - 1) : undefined}
          onMoveDown={index < entries.length - 1 ? () => moveEntry(index, index + 1) : undefined}
          onRemove={() => removeEntry(index)}
          readOnly={readOnly}
        >
          <ComponentChildren fields={childFields} name={`${name}.${index}`} />
        </RepeatableEntry>
      ))}
      {!readOnly && (
        <Button ref={addRef} variant="outline" className="self-start" onClick={add}>
          <Plus aria-hidden="true" />
          Add {label.toLowerCase()} item
        </Button>
      )}
    </fieldset>
  );
};
RepeatableField.displayName = 'RepeatableField';
