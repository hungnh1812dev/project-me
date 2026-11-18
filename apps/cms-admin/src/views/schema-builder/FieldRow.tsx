import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import { ArrowDown, ArrowUp, CircleAlert, Copy, FolderInput, Trash2 } from 'lucide-react';

import { findFieldType } from './FieldTypes.registry';
import type { ListOwnerId, SchemaField } from './SchemaTree.reducer';

export interface MoveTarget {
  parentId: ListOwnerId;
  label: string;
}

interface FieldRowProps {
  field: SchemaField;
  isSelected: boolean;
  hasErrors: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** Lists other than the field's own that can take it (`moveTargetsOf`). */
  moveTargets: readonly MoveTarget[];
  /** The drag handle of this row, built by the canvas (SB-5). */
  dragHandle?: ReactNode;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveTo: (parentId: ListOwnerId) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** One field of the canvas: its name, type and markers, with the non-drag controls (SB-5). */
export function FieldRow({
  field,
  isSelected,
  hasErrors,
  isFirst,
  isLast,
  moveTargets,
  dragHandle,
  onSelect,
  onMoveUp,
  onMoveDown,
  onMoveTo,
  onDuplicate,
  onDelete,
}: FieldRowProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder;
  const type = findFieldType(field.type);
  const typeLabel = type === undefined ? field.type : copy.fieldTypes[type.copyKey];
  const TypeIcon = type?.icon;
  const markers = [
    field.required === true ? copy.row.markers.required : null,
    field.sensitive === true ? copy.row.markers.sensitive : null,
    field.repeatable === true ? copy.row.markers.repeatable : null,
    field.width === undefined ? null : copy.row.markers.width(field.width),
  ].filter((marker): marker is string => marker !== null);

  return (
    <div
      data-selected={isSelected ? 'true' : undefined}
      className={`flex flex-wrap items-center gap-1 rounded-control border px-1 py-1 ${
        isSelected ? 'border-primary bg-nav-active' : 'border-border bg-card'
      }`}
    >
      {dragHandle}
      <button
        type="button"
        data-field-select={field.id}
        aria-pressed={isSelected}
        aria-label={copy.row.select(field.name)}
        onClick={onSelect}
        className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-2 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        <span className="truncate text-sm font-medium">{field.name || ' '}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {TypeIcon === undefined ? null : <TypeIcon aria-hidden="true" className="size-3.5" />}
          {typeLabel}
        </span>
        {markers.map((marker) => (
          <span
            key={marker}
            className="rounded-control border border-border bg-muted px-1.5 text-xs text-muted-foreground"
          >
            {marker}
          </span>
        ))}
        {hasErrors ? (
          <span className="flex items-center gap-1 text-xs font-medium text-destructive-strong">
            <CircleAlert aria-hidden="true" className="size-3.5" />
            {copy.row.hasErrors}
          </span>
        ) : null}
      </button>
      <div className="flex items-center">
        <IconButton
          type="button"
          variant="ghost"
          label={copy.row.moveUp(field.name)}
          disabled={isFirst}
          onClick={onMoveUp}
        >
          <ArrowUp aria-hidden="true" />
        </IconButton>
        <IconButton
          type="button"
          variant="ghost"
          label={copy.row.moveDown(field.name)}
          disabled={isLast}
          onClick={onMoveDown}
        >
          <ArrowDown aria-hidden="true" />
        </IconButton>
        {moveTargets.length === 0 ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton type="button" variant="ghost" label={copy.row.moveTo(field.name)}>
                <FolderInput aria-hidden="true" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {moveTargets.map((target) => (
                <DropdownMenuItem
                  key={target.parentId ?? 'root'}
                  onSelect={() => onMoveTo(target.parentId)}
                >
                  {target.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <IconButton
          type="button"
          variant="ghost"
          label={copy.row.duplicate(field.name)}
          onClick={onDuplicate}
        >
          <Copy aria-hidden="true" />
        </IconButton>
        <IconButton
          type="button"
          variant="ghost"
          label={copy.row.remove(field.name)}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
