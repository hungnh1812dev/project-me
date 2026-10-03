import { useFormContext, useWatch } from 'react-hook-form';

import { SchemaField } from '@/components/form/SchemaField';
import { entryHint, widthClass } from '@/features/content/schema';
import type { FieldDefinition } from '@/features/content/types';
import { cn } from '@/utils/cn';

export interface ComponentFieldProps {
  field: FieldDefinition;
  label: string;
  /** The form value path of the component object, such as `seo` or `gallery.0.seo`. */
  name: string;
  /** Below the top level: a collapsible `details` that shows the entry hint. */
  nested?: boolean;
  className?: string;
}

/** The component's child fields in the 6-column grid, each on its full name path. */
export const ComponentChildren: React.FC<{ fields: readonly FieldDefinition[]; name: string }> = ({
  fields,
  name,
}) => (
  <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-6">
    {fields.map((child) => (
      <SchemaField
        key={child.name}
        field={child}
        name={`${name}.${child.name}`}
        nested
        className={cn('min-w-0', widthClass(child.width))}
      />
    ))}
  </div>
);
ComponentChildren.displayName = 'ComponentChildren';

/** The live entry hint (header or first text value) of the component object at `name`. */
const ComponentHint: React.FC<{ fields: readonly FieldDefinition[]; name: string }> = ({
  fields,
  name,
}) => {
  const { control } = useFormContext();
  const value: unknown = useWatch({ control, name });
  const hint = entryHint(fields, value);
  if (hint === null) return null;
  return <span className="min-w-0 truncate font-normal text-muted-foreground">{hint}</span>;
};
ComponentHint.displayName = 'ComponentHint';

/**
 * A non-repeatable `component` field (AC-9). At the top level it is a `fieldset` with a `legend`.
 * Below it, it is a native `details` (open at first) whose summary shows the entry hint.
 */
export const ComponentField: React.FC<ComponentFieldProps> = ({
  field,
  label,
  name,
  nested = false,
  className,
}) => {
  const fields = field.fields ?? [];
  if (!nested) {
    return (
      <fieldset className={cn('flex flex-col gap-4 rounded-lg border p-4', className)}>
        <legend className="px-1 text-sm font-medium">{label}</legend>
        <ComponentChildren fields={fields} name={name} />
      </fieldset>
    );
  }
  return (
    <details open className={cn('group rounded-lg border', className)}>
      <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span>{label}</span>
        <ComponentHint fields={fields} name={name} />
      </summary>
      <fieldset aria-label={label} className="min-w-0 px-4 pb-4">
        <ComponentChildren fields={fields} name={name} />
      </fieldset>
    </details>
  );
};
ComponentField.displayName = 'ComponentField';
