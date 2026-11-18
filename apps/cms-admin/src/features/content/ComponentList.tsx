import { useEffect, useRef, type ReactNode } from 'react';
import { Card, CONTROL_FOCUS_RING_ONLY_CLASSES, IconButton } from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import { MAX_COMPONENT_DEPTH, SINGLE_COMPONENT_MAX_ITEMS } from './Content.constants';
import { emptyItem } from './Document.form';
import { DynamicFormRenderer } from './DynamicFormRenderer';
import type { FieldNode } from './FieldTree.rules';

type MoveDirection = 'up' | 'down';

export interface ComponentListProps {
  node: FieldNode;
  /** Form path of the array (`experience`, `experience.0.role`). */
  name: string;
  masked: ReadonlySet<string>;
  /** 1 for a component directly on the document. */
  depth: number;
}

const ITEM_CLASSES = 'grid gap-4';

/** A top-level item is a Card; an item inside another item is a muted section (no card in a card). */
function Item({ isNested, children }: { isNested: boolean; children: ReactNode }) {
  if (isNested) return <li className={`${ITEM_CLASSES} rounded-item bg-muted p-4`}>{children}</li>;
  return (
    <Card asChild padding="compact">
      <li className={ITEM_CLASSES}>{children}</li>
    </Card>
  );
}

/**
 * Items of a component field with add, remove and reorder. Items keep their
 * `componentUid` in form state so a save updates the same rows. A
 * non-repeatable component holds one item at most.
 */
export function ComponentList({ node, name, masked, depth }: ComponentListProps) {
  const copy = useScreenText('content').content.list;
  const { control } = useFormContext();
  const { fields, append, remove, move } = useFieldArray({ control, name });
  const listRef = useRef<HTMLOListElement>(null);
  const pendingFocus = useRef<{ index: number; direction: MoveDirection } | null>(null);
  const canAdd =
    depth <= MAX_COMPONENT_DEPTH && (node.repeatable || fields.length < SINGLE_COMPONENT_MAX_ITEMS);
  const reorderable = node.repeatable && fields.length > 1;
  const headingId = `${name}-heading`;

  // Reordering re-inserts the row, which drops focus; hand it back to the moved item's control.
  useEffect(() => {
    const movedTo = pendingFocus.current;
    if (!movedTo) return;
    pendingFocus.current = null;
    const row = listRef.current?.children[movedTo.index];
    const sameDirection = row?.querySelector<HTMLElement>(`[data-move="${movedTo.direction}"]`);
    const oppositeDirection = row?.querySelector<HTMLElement>(
      `[data-move="${movedTo.direction === 'up' ? 'down' : 'up'}"]`,
    );
    const isDisabled = sameDirection?.hasAttribute('disabled');
    (isDisabled ? oppositeDirection : sameDirection)?.focus();
  });

  const moveItem = (index: number, direction: MoveDirection) => {
    const target = direction === 'up' ? index - 1 : index + 1;
    move(index, target);
    pendingFocus.current = { index: target, direction };
  };

  return (
    <section
      aria-labelledby={headingId}
      className={depth > 1 ? 'grid gap-3 border-l-2 border-border pl-4' : 'grid gap-3'}
    >
      <h2
        id={headingId}
        className={depth > 1 ? 'm-0 text-sm font-semibold' : 'm-0 text-base font-semibold'}
      >
        {node.label}
      </h2>
      {fields.length > 0 ? (
        <ol ref={listRef} className="m-0 grid list-none gap-3 p-0">
          {fields.map((item, index) => (
            <Item key={item.id} isNested={depth > 1}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <IconButton
                    type="button"
                    variant="ghost"
                    label={copy.remove(node.label, index)}
                    onClick={() => remove(index)}
                  >
                    <X aria-hidden="true" />
                  </IconButton>
                  <h3 className="m-0 text-sm font-medium text-muted-foreground">
                    {copy.itemTitle(node.label, index)}
                  </h3>
                </div>
                {reorderable ? (
                  <div className="flex items-center gap-1">
                    <IconButton
                      type="button"
                      variant="ghost"
                      data-move="up"
                      disabled={index === 0}
                      label={copy.moveUp(node.label, index)}
                      onClick={() => moveItem(index, 'up')}
                    >
                      <ArrowUp aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      type="button"
                      variant="ghost"
                      data-move="down"
                      disabled={index === fields.length - 1}
                      label={copy.moveDown(node.label, index)}
                      onClick={() => moveItem(index, 'down')}
                    >
                      <ArrowDown aria-hidden="true" />
                    </IconButton>
                  </div>
                ) : null}
              </div>
              <DynamicFormRenderer
                fields={node.children}
                masked={masked}
                prefix={`${name}.${index}`}
                depth={depth + 1}
              />
            </Item>
          ))}
        </ol>
      ) : null}
      {canAdd ? (
        <button
          type="button"
          onClick={() => append(emptyItem(node))}
          className={`flex min-h-20 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-item border border-dashed border-input bg-transparent p-4 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:border-ring hover:bg-muted hover:text-foreground motion-reduce:transition-none ${CONTROL_FOCUS_RING_ONLY_CLASSES}`}
        >
          <Plus aria-hidden="true" className="size-5" />
          {copy.addSlot(node.label)}
        </button>
      ) : null}
    </section>
  );
}
