import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '@abyss/form-commons';
import { ConfirmDialog } from '@components/ConfirmDialog';
import { useScreenText } from '@configs/locales';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';

import { AddFieldMenu } from './FieldPalette';
import { FieldRow, type MoveTarget } from './FieldRow';
import type { FieldTypeName } from './FieldTypes.registry';
import { listDropId, useIsListOffered } from './SchemaDragContext';
import type { LocatedError } from './SchemaJson.rules';
import {
  canPlaceComponentIn,
  findField,
  moveTargetsOf,
  type ListOwnerId,
  type SchemaField,
  type SchemaTree,
} from './SchemaTree.reducer';

/** One list of fields; empty or not, it is a drop zone that takes the dragged item at its end. */
function ListZone({ ownerId, children }: { ownerId: ListOwnerId; children: ReactNode }) {
  const isOffered = useIsListOffered(ownerId);
  const { setNodeRef, isOver } = useDroppable({ id: listDropId(ownerId), disabled: !isOffered });
  return (
    <div
      ref={setNodeRef}
      className={`grid min-h-10 gap-2 rounded-control ${isOver ? 'bg-nav-active' : ''}`}
    >
      {children}
    </div>
  );
}

interface SortableFieldItemProps {
  field: SchemaField;
  ownerId: ListOwnerId;
  children: (dragHandle: ReactNode) => ReactNode;
}

/** A field's list item: sortable within its list, with the drag handle for the row. */
function SortableFieldItem({ field, ownerId, children }: SortableFieldItemProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder;
  const isOffered = useIsListOffered(ownerId);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id, disabled: { droppable: !isOffered } });
  const dragHandle = (
    <IconButton
      ref={setActivatorNodeRef}
      type="button"
      variant="ghost"
      label={copy.dnd.fieldHandle(field.name)}
      data-field-drag={field.id}
      className="cursor-grab touch-none"
      {...attributes}
      {...listeners}
    >
      <GripVertical aria-hidden="true" />
    </IconButton>
  );
  return (
    <li
      ref={setNodeRef}
      className={`grid gap-2 ${isDragging ? 'opacity-50' : ''}`}
      style={{
        transform:
          transform === null ? undefined : `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        transition,
      }}
    >
      {children(dragHandle)}
    </li>
  );
}

/** Moving to another list puts the field at its end. */
const END_OF_LIST = Number.POSITIVE_INFINITY;

interface SchemaCanvasProps {
  tree: SchemaTree;
  selectedFieldId: string | null;
  /** Errors of the current tree only; none while a newer check runs. */
  errors: readonly LocatedError[];
  onSelect: (fieldId: string) => void;
  onAdd: (parentId: ListOwnerId, fieldType: FieldTypeName) => void;
  onMove: (fieldId: string, parentId: ListOwnerId, index: number) => void;
  onDuplicate: (fieldId: string) => void;
  onDelete: (fieldId: string) => void;
}

const countDescendants = (field: SchemaField): number =>
  field.fields.reduce((total, child) => total + 1 + countDescendants(child), 0);

/** The field tree in order: rows, component boxes with their own lists, and per-list "Add field" (SB-5, SB-7). */
export function SchemaCanvas({
  tree,
  selectedFieldId,
  errors,
  onSelect,
  onAdd,
  onMove,
  onDuplicate,
  onDelete,
}: SchemaCanvasProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder;
  const canvasRef = useRef<HTMLDivElement>(null);
  const focusFieldId = useRef<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SchemaField | null>(null);

  // A moved or copied row may have been re-created; put keyboard focus back on it.
  useEffect(() => {
    const id = focusFieldId.current;
    if (id === null) return;
    focusFieldId.current = null;
    canvasRef.current?.querySelector<HTMLElement>(`[data-field-select="${id}"]`)?.focus();
  });

  const moveTargetsFor = (fieldId: string, ownerId: ListOwnerId): MoveTarget[] =>
    moveTargetsOf(tree, fieldId)
      .filter((target) => target.parentId !== ownerId)
      .map(({ parentId }) => ({
        parentId,
        label:
          parentId === null
            ? copy.row.moveToRoot
            : copy.row.moveToComponent(findField(tree.fields, parentId)?.name ?? ''),
      }));

  const move = (fieldId: string, parentId: ListOwnerId, index: number) => {
    focusFieldId.current = fieldId;
    onMove(fieldId, parentId, index);
  };
  const remove = (field: SchemaField) => {
    setPendingDelete(null);
    onDelete(field.id);
    canvasRef.current?.focus();
  };

  const renderList = (
    ownerId: ListOwnerId,
    fields: readonly SchemaField[],
    label: string,
    emptyText: string,
  ) => (
    <ListZone ownerId={ownerId}>
      {fields.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <SortableContext
          items={fields.map((field) => field.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul aria-label={label} className="m-0 grid list-none gap-2 p-0">
            {fields.map((field, index) => (
              <SortableFieldItem key={field.id} field={field} ownerId={ownerId}>
                {(dragHandle) => (
                  <>
                    <FieldRow
                      field={field}
                      isSelected={field.id === selectedFieldId}
                      hasErrors={errors.some((error) => error.fieldId === field.id)}
                      isFirst={index === 0}
                      isLast={index === fields.length - 1}
                      moveTargets={moveTargetsFor(field.id, ownerId)}
                      dragHandle={dragHandle}
                      onSelect={() => onSelect(field.id)}
                      onMoveUp={() => move(field.id, ownerId, index - 1)}
                      onMoveDown={() => move(field.id, ownerId, index + 1)}
                      onMoveTo={(parentId) => move(field.id, parentId, END_OF_LIST)}
                      onDuplicate={() => {
                        focusFieldId.current = null;
                        onDuplicate(field.id);
                      }}
                      onDelete={() =>
                        field.fields.length > 0 ? setPendingDelete(field) : remove(field)
                      }
                    />
                    {field.type === 'component' ? (
                      <div className="ml-4 grid gap-2 border-l-2 border-border pl-3">
                        {renderList(
                          field.id,
                          field.fields,
                          copy.fields.listLabel(field.name),
                          copy.fields.emptyComponent,
                        )}
                        <div>
                          <AddFieldMenu
                            ownerName={field.name}
                            canAddComponent={canPlaceComponentIn(tree, field.id)}
                            onPick={(fieldType) => onAdd(field.id, fieldType)}
                          />
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </SortableFieldItem>
            ))}
          </ul>
        </SortableContext>
      )}
    </ListZone>
  );

  return (
    <div ref={canvasRef} tabIndex={-1} className="grid gap-3 outline-none">
      {renderList(null, tree.fields, copy.fields.rootListLabel, copy.fields.empty)}
      <div>
        <AddFieldMenu
          canAddComponent={canPlaceComponentIn(tree, null)}
          onPick={(fieldType) => onAdd(null, fieldType)}
        />
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={copy.row.deleteDialog.title(pendingDelete?.name ?? '')}
        description={copy.row.deleteDialog.description(
          pendingDelete === null ? 0 : countDescendants(pendingDelete),
        )}
        cancelLabel={copy.row.deleteDialog.cancel}
        confirmLabel={copy.row.deleteDialog.confirm(pendingDelete?.name ?? '')}
        confirmVariant="destructive"
        onConfirm={() => pendingDelete !== null && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
        onCloseFocus={() => canvasRef.current?.focus()}
      />
    </div>
  );
}
