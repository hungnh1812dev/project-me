import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Plus, type LucideIcon } from 'lucide-react';

import { COMPONENT_FIELD_TYPE, FIELD_TYPES, type FieldTypeName } from './FieldTypes.registry';

interface FieldPaletteProps {
  /** Component is left out where a new component would pass the depth limit (SB-7). */
  canAddComponent: boolean;
  onPick: (fieldType: FieldTypeName) => void;
}

/** Draggable ids of palette items are this prefix plus the field type; field ids never start with it. */
export const PALETTE_ID_PREFIX = 'palette:';

const isOffered = (type: string, canAddComponent: boolean) =>
  canAddComponent || type !== COMPONENT_FIELD_TYPE;

/** One item per field type; picking one adds a field at the end of the top level (SB-4). */
export function FieldPalette({ canAddComponent, onPick }: FieldPaletteProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder;
  return (
    <section aria-labelledby="schema-palette-heading" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="schema-palette-heading" className="m-0 text-base font-semibold">
          {copy.fields.paletteHeading}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">{copy.fields.paletteHint}</p>
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
        {FIELD_TYPES.filter(({ type }) => isOffered(type, canAddComponent)).map(
          ({ type, icon, copyKey }) => (
            <PaletteItem
              key={type}
              type={type}
              icon={icon}
              label={copy.fieldTypes[copyKey]}
              onPick={onPick}
            />
          ),
        )}
      </ul>
    </section>
  );
}

interface PaletteItemProps {
  type: FieldTypeName;
  icon: LucideIcon;
  label: string;
  onPick: (fieldType: FieldTypeName) => void;
}

/** The pick button plus a drag handle: the button keeps its plain click, the handle starts a drag. */
function PaletteItem({ type, icon: Icon, label, onPick }: PaletteItemProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `${PALETTE_ID_PREFIX}${type}`,
  });
  return (
    <li ref={setNodeRef} className={`flex items-center gap-0.5 ${isDragging ? 'opacity-60' : ''}`}>
      <IconButton
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        label={copy.dnd.paletteHandle(label)}
        className="cursor-grab touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" />
      </IconButton>
      <Button
        type="button"
        size="sm"
        className="flex-1 justify-start whitespace-nowrap"
        onClick={() => onPick(type)}
      >
        <Icon aria-hidden="true" />
        {label}
      </Button>
    </li>
  );
}

interface AddFieldMenuProps extends FieldPaletteProps {
  /** Names the list the menu adds to when it is not the top level. */
  ownerName?: string;
}

/** The palette as the "Add field" menu of one list. */
export function AddFieldMenu({ ownerName, canAddComponent, onPick }: AddFieldMenuProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          aria-label={ownerName === undefined ? undefined : copy.fields.addFieldTo(ownerName)}
        >
          <Plus aria-hidden="true" />
          {copy.fields.addField}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {FIELD_TYPES.filter(({ type }) => isOffered(type, canAddComponent)).map(
          ({ type, icon: Icon, copyKey }) => (
            <DropdownMenuItem key={type} onSelect={() => onPick(type)}>
              <Icon aria-hidden="true" />
              {copy.fieldTypes[copyKey]}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
