import { useEffect, useRef, type ReactNode } from 'react';
import { Card, CONTROL_FOCUS_RING_ONLY_CLASSES, IconButton } from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { ITEM_UID_KEY, MAX_COMPONENT_DEPTH, SINGLE_COMPONENT_MAX_ITEMS } from './Content.constants';
import { emptyItem } from './Document.form';
import { DynamicFormRenderer } from './DynamicFormRenderer';
import type { FieldNode } from './FieldTree.rules';
import { itemHeaderTextOf } from './ItemHeader.rules';
import { useItemOpenControls, useItemOpenState } from './ItemOpenState.context';

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
  if (isNested)
    return (
      <li
        className={`${ITEM_CLASSES} rounded-control border border-border/50 bg-muted/40 p-4 shadow-xs`}
      >
        {children}
      </li>
    );
  return (
    <Card asChild padding="compact" className="border border-border shadow-xs">
      <li className={ITEM_CLASSES}>{children}</li>
    </Card>
  );
}

const itemUidOf = (field: Record<string, unknown>): string =>
  typeof field[ITEM_UID_KEY] === 'string' ? field[ITEM_UID_KEY] : '';

interface ItemRowProps {
  node: FieldNode;
  name: string;
  masked: ReadonlySet<string>;
  depth: number;
  index: number;
  itemKey: string;
  count: number;
  onRemove: () => void;
  onMove: (direction: MoveDirection) => void;
}

/** One item: header (toggle, remove, move) and body. Only a repeatable component's item collapses (CE-6). */
function ItemRow({
  node,
  name,
  masked,
  depth,
  index,
  itemKey,
  count,
  onRemove,
  onMove,
}: ItemRowProps) {
  const copy = useScreenText('content').content.list;
  const { control } = useFormContext();
  const itemName = `${name}.${index}`;
  const values = useWatch({ control, name: itemName }) as Record<string, unknown> | undefined;
  const { isOpen, toggle } = useItemOpenState(itemKey);
  const collapsible = node.repeatable;
  const reorderable = node.repeatable && count > 1;
  const bodyId = `${itemName}-body`;
  const headerText = collapsible
    ? itemHeaderTextOf(node, values ?? {}, masked, index + 1, copy)
    : copy.itemTitle(node.label, index);

  return (
    <Item isNested={depth > 1}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <IconButton
            type="button"
            variant="ghost"
            label={copy.remove(node.label, index)}
            onClick={onRemove}
          >
            <X aria-hidden="true" />
          </IconButton>
          <h3 className="m-0 min-w-0 flex-1 text-sm font-medium text-muted-foreground">
            {collapsible ? (
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                aria-label={copy.toggleItem(headerText)}
                onClick={toggle}
                className={`flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-control border-0 bg-transparent p-1 text-left text-sm font-medium text-foreground hover:bg-muted ${CONTROL_FOCUS_RING_ONLY_CLASSES}`}
              >
                {isOpen ? (
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
                )}
                <span className="truncate">{headerText}</span>
              </button>
            ) : (
              headerText
            )}
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
              onClick={() => onMove('up')}
            >
              <ArrowUp aria-hidden="true" />
            </IconButton>
            <IconButton
              type="button"
              variant="ghost"
              data-move="down"
              disabled={index === count - 1}
              label={copy.moveDown(node.label, index)}
              onClick={() => onMove('down')}
            >
              <ArrowDown aria-hidden="true" />
            </IconButton>
          </div>
        ) : null}
      </div>
      <div id={bodyId} hidden={collapsible && !isOpen} className="grid gap-4">
        <DynamicFormRenderer
          fields={node.children}
          masked={masked}
          prefix={itemName}
          depth={depth + 1}
        />
      </div>
    </Item>
  );
}

/**
 * Items of a component field with add, remove and reorder. Items keep their
 * `componentUid` in form state so a save updates the same rows. A
 * non-repeatable component holds one item at most. Repeatable items collapse;
 * their open state lives in `ItemOpenState.context` (the page), keyed by
 * `componentUid`, or by the row id while an item has no uid yet.
 */
export function ComponentList({ node, name, masked, depth }: ComponentListProps) {
  const copy = useScreenText('content').content.list;
  const { control } = useFormContext();
  const { fields, append, remove, move } = useFieldArray({ control, name });
  const openState = useItemOpenControls();
  const { open, close, trackNewItem, untrackNewItem } = openState;
  const listRef = useRef<HTMLOListElement>(null);
  const pendingFocus = useRef<{ index: number; direction: MoveDirection } | null>(null);
  const pendingOpenIndex = useRef<number | null>(null);
  const canAdd =
    depth <= MAX_COMPONENT_DEPTH && (node.repeatable || fields.length < SINGLE_COMPONENT_MAX_ITEMS);
  const headingId = `${name}-heading`;
  const itemKeys = fields.map((field) => itemUidOf(field) || field.id);

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

  // An item added by the editor opens; its key is only known once it renders.
  useEffect(() => {
    const addedAt = pendingOpenIndex.current;
    if (addedAt === null) return;
    pendingOpenIndex.current = null;
    const key = itemKeys[addedAt];
    if (key !== undefined) open(key);
  });

  // Items without a uid are remembered by position so a write can re-key them.
  useEffect(() => {
    const trackedKeys: string[] = [];
    fields.forEach((field, index) => {
      if (itemUidOf(field) !== '') return;
      trackNewItem(field.id, `${name}.${index}`);
      trackedKeys.push(field.id);
    });
    return () => trackedKeys.forEach(untrackNewItem);
  }, [fields, name, trackNewItem, untrackNewItem]);

  const moveItem = (index: number, direction: MoveDirection) => {
    const target = direction === 'up' ? index - 1 : index + 1;
    move(index, target);
    pendingFocus.current = { index: target, direction };
  };

  const addItem = () => {
    pendingOpenIndex.current = fields.length;
    append(emptyItem(node));
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
          {fields.map((field, index) => (
            <ItemRow
              key={field.id}
              node={node}
              name={name}
              masked={masked}
              depth={depth}
              index={index}
              itemKey={itemKeys[index] ?? field.id}
              count={fields.length}
              onRemove={() => {
                close(itemKeys[index] ?? field.id);
                remove(index);
              }}
              onMove={(direction) => moveItem(index, direction)}
            />
          ))}
        </ol>
      ) : null}
      {canAdd ? (
        <button
          type="button"
          onClick={addItem}
          className={`flex min-h-20 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-item border border-dashed border-input bg-transparent p-4 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:border-ring hover:bg-muted hover:text-foreground motion-reduce:transition-none ${CONTROL_FOCUS_RING_ONLY_CLASSES}`}
        >
          <Plus aria-hidden="true" className="size-5" />
          {copy.addSlot(node.label)}
        </button>
      ) : null}
    </section>
  );
}
