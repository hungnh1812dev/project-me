import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import { Plus } from 'lucide-react';

import { COMPONENT_FIELD_TYPE, FIELD_TYPES, type FieldTypeName } from './FieldTypes.registry';

interface FieldPaletteProps {
  /** Component is left out where a new component would pass the depth limit (SB-7). */
  canAddComponent: boolean;
  onPick: (fieldType: FieldTypeName) => void;
}

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
          ({ type, icon: Icon, copyKey }) => (
            <li key={type}>
              <Button
                type="button"
                size="sm"
                className="w-full justify-start"
                onClick={() => onPick(type)}
              >
                <Icon aria-hidden="true" />
                {copy.fieldTypes[copyKey]}
              </Button>
            </li>
          ),
        )}
      </ul>
    </section>
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
