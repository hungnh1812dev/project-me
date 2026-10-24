import { Button } from '@abyss/form-commons';
import { useFieldArray, useFormContext } from 'react-hook-form';

import {
  MAX_COMPONENT_DEPTH,
  SINGLE_COMPONENT_MAX_ITEMS,
} from './content.constants';
import { COPY } from '../../config/copy.constants';
import { emptyItem } from './document-form';
import { DynamicFormRenderer } from './DynamicFormRenderer';
import type { FieldNode } from './field-tree';

const copy = COPY.content.list;

export interface ComponentListProps {
  node: FieldNode;
  /** Form path of the array (`experience`, `experience.0.role`). */
  name: string;
  masked: ReadonlySet<string>;
  /** 1 for a component directly on the document. */
  depth: number;
}

/**
 * Items of a component field with add, remove and reorder. Items keep their
 * `componentUid` in form state so a save updates the same rows. A
 * non-repeatable component holds one item at most.
 */
export function ComponentList({
  node,
  name,
  masked,
  depth,
}: ComponentListProps) {
  const { control } = useFormContext();
  const { fields, append, remove, move } = useFieldArray({ control, name });
  const canAdd =
    depth <= MAX_COMPONENT_DEPTH &&
    (node.repeatable || fields.length < SINGLE_COMPONENT_MAX_ITEMS);
  const reorderable = node.repeatable && fields.length > 1;
  const headingId = `${name}-heading`;

  return (
    <section
      aria-labelledby={headingId}
      className={
        depth > 1 ? 'grid gap-3 border-l-2 border-border pl-4' : 'grid gap-3'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id={headingId}
          className={
            depth > 1
              ? 'm-0 text-sm font-semibold'
              : 'm-0 text-base font-semibold'
          }
        >
          {node.label}
        </h2>
        {canAdd ? (
          <Button
            type="button"
            size="sm"
            onClick={() => append(emptyItem(node))}
          >
            {copy.add(node.label)}
          </Button>
        ) : null}
      </div>
      {fields.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          {copy.empty(node.label)}
        </p>
      ) : (
        <ol className="m-0 grid list-none gap-3 p-0">
          {fields.map((item, index) => (
            <li
              key={item.id}
              className="grid gap-4 rounded-md border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-sm font-medium text-muted-foreground">
                  {copy.itemTitle(node.label, index)}
                </h3>
                <div className="flex items-center gap-1">
                  {reorderable ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={index === 0}
                        aria-label={copy.moveUp(node.label, index)}
                        onClick={() => move(index, index - 1)}
                      >
                        {copy.upText}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={index === fields.length - 1}
                        aria-label={copy.moveDown(node.label, index)}
                        onClick={() => move(index, index + 1)}
                      >
                        {copy.downText}
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={copy.remove(node.label, index)}
                    onClick={() => remove(index)}
                  >
                    {copy.removeText}
                  </Button>
                </div>
              </div>
              <DynamicFormRenderer
                fields={node.children}
                masked={masked}
                prefix={`${name}.${index}`}
                depth={depth + 1}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
