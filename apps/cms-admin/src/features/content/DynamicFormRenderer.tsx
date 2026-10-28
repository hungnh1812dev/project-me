import { Field, Input } from '@abyss/form-commons';
import { useFormContext, useWatch } from 'react-hook-form';

import { COPY } from '../../config/Copy.constants';
import { ComponentList } from './ComponentList';
import { adapterFor } from './Field.registry';
import type { FieldNode } from './FieldTree.rules';

const copy = COPY.content;

export interface DynamicFormRendererProps {
  fields: readonly FieldNode[];
  /** Paths (no item indexes) the caller's role cannot read. */
  masked: ReadonlySet<string>;
  /** Form path of the object holding these fields; '' at the root. */
  prefix?: string;
  /** 1 at the root's components; deeper levels are indented. */
  depth?: number;
}

/**
 * Renders a content type's fields inside a react-hook-form `FormProvider`.
 * Each field type maps to an input through `Field.registry`; masked fields
 * are read-only "Protected (***)" and are left out of the payload.
 */
export function DynamicFormRenderer({
  fields,
  masked,
  prefix = '',
  depth = 1,
}: DynamicFormRendererProps) {
  return (
    <div className="grid gap-5">
      {fields.map((node) => {
        const name = prefix === '' ? node.name : `${prefix}.${node.name}`;
        if (masked.has(node.path)) {
          return (
            <ProtectedField
              key={node.path}
              label={node.label}
              group={node.children.length > 0}
            />
          );
        }
        if (node.children.length > 0) {
          return (
            <ComponentList
              key={node.path}
              node={node}
              name={name}
              masked={masked}
              depth={depth}
            />
          );
        }
        const adapter = adapterFor(node.type);
        if (!adapter.editable) {
          return (
            <ReadOnlyField key={node.path} name={name} label={node.label} />
          );
        }
        return (
          <div key={node.path}>
            {adapter.render({ name, label: node.label })}
          </div>
        );
      })}
    </div>
  );
}

/** A field the role cannot read: fixed text, nothing to edit or send. */
function ProtectedField({ label, group }: { label: string; group: boolean }) {
  return (
    <Field
      label={label}
      description={group ? copy.protectedGroup(label) : copy.protectedHint}
    >
      {(control) => (
        <Input
          {...control}
          readOnly
          value={copy.protectedValue}
          className="bg-muted text-muted-foreground"
        />
      )}
    </Field>
  );
}

/** A field type whose editor is not built yet: shows the stored value only. */
function ReadOnlyField({ name, label }: { name: string; label: string }) {
  const { control } = useFormContext();
  const value: unknown = useWatch({ control, name });
  const shown =
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : copy.emptyValue;
  return (
    <Field label={label} description={copy.notEditableYet}>
      {(controlProps) => (
        <Input
          {...controlProps}
          readOnly
          value={shown}
          className="bg-muted text-muted-foreground"
        />
      )}
    </Field>
  );
}
