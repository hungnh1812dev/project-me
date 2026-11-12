import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@components/ConfirmDialog';
import { useScreenText } from '@configs/locales';

import { AddFieldMenu } from './FieldPalette';
import { FieldRow, type MoveTarget } from './FieldRow';
import type { FieldTypeName } from './FieldTypes.registry';
import type { LocatedError } from './SchemaJson.rules';
import {
  canPlaceComponentIn,
  findField,
  moveTargetsOf,
  type ListOwnerId,
  type SchemaField,
  type SchemaTree,
} from './SchemaTree.reducer';

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

  const renderList = (ownerId: ListOwnerId, fields: readonly SchemaField[], label: string) => (
    <div className="grid gap-2">
      {fields.length === 0 ? null : (
        <ul aria-label={label} className="m-0 grid list-none gap-2 p-0">
          {fields.map((field, index) => (
            <li key={field.id} className="grid gap-2">
              <FieldRow
                field={field}
                isSelected={field.id === selectedFieldId}
                hasErrors={errors.some((error) => error.fieldId === field.id)}
                isFirst={index === 0}
                isLast={index === fields.length - 1}
                moveTargets={moveTargetsFor(field.id, ownerId)}
                onSelect={() => onSelect(field.id)}
                onMoveUp={() => move(field.id, ownerId, index - 1)}
                onMoveDown={() => move(field.id, ownerId, index + 1)}
                onMoveTo={(parentId) => move(field.id, parentId, END_OF_LIST)}
                onDuplicate={() => {
                  focusFieldId.current = null;
                  onDuplicate(field.id);
                }}
                onDelete={() => (field.fields.length > 0 ? setPendingDelete(field) : remove(field))}
              />
              {field.type === 'component' ? (
                <div className="ml-4 grid gap-2 border-l-2 border-border pl-3">
                  {renderList(field.id, field.fields, copy.fields.listLabel(field.name))}
                  {field.fields.length === 0 ? (
                    <p className="m-0 text-sm text-muted-foreground">
                      {copy.fields.emptyComponent}
                    </p>
                  ) : null}
                  <div>
                    <AddFieldMenu
                      ownerName={field.name}
                      canAddComponent={canPlaceComponentIn(tree, field.id)}
                      onPick={(fieldType) => onAdd(field.id, fieldType)}
                    />
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div ref={canvasRef} tabIndex={-1} className="grid gap-3 outline-none">
      {tree.fields.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{copy.fields.empty}</p>
      ) : null}
      {renderList(null, tree.fields, copy.fields.rootListLabel)}
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
