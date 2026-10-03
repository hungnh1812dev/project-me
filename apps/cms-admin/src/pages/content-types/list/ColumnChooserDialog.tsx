import { useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

import { Button } from '@repo/ui/components/button';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isApiError } from '@/core/api/apiError';
import type { ColumnCatalog } from '@/features/content/columns';
import { useUpdateListFields } from '@/features/content/hooks/useContentTypes';
import type { ContentType } from '@/features/content/types';

const EMPTY = 'Choose at least one column.';
const NO_ACCESS = "You don't have access to do this.";
const BOX = 'size-5 shrink-0 cursor-pointer accent-primary lg:size-4';

const errorText = (error: unknown): string =>
  isApiError(error) && error.status === 403
    ? NO_ACCESS
    : error instanceof Error
      ? error.message
      : NO_ACCESS;

interface Choice {
  key: string;
  label: string;
  checked: boolean;
}

/** The chosen `listFields` first, in their order, then every other listable column. */
function initialChoices(type: ContentType, catalog: ColumnCatalog): Choice[] {
  const chosen = type.listFields.filter((key) => catalog.listable.includes(key));
  const rest = catalog.listable.filter((key) => !chosen.includes(key));
  return [...chosen, ...rest].map((key) => ({
    key,
    label: catalog.byKey.get(key)!.label,
    checked: chosen.includes(key),
  }));
}

const ChooserForm: React.FC<{
  type: ContentType;
  catalog: ColumnCatalog;
  onSaved: () => void;
}> = ({ type, catalog, onSaved }) => {
  const [choices, setChoices] = useState(() => initialChoices(type, catalog));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useUpdateListFields(type.slug);

  const move = (from: number, to: number) =>
    setChoices((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });

  const submit = async () => {
    const listFields = choices.filter((c) => c.checked).map((c) => c.key);
    if (listFields.length === 0) {
      setProblem(EMPTY);
      return;
    }
    setProblem(null);
    try {
      await save.mutateAsync(listFields);
      onSaved();
    } catch (error) {
      setProblem(errorText(error));
    }
  };

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <ul aria-label="Columns" className="flex flex-col divide-y rounded-md border">
        {choices.map((choice, index) => (
          <li key={choice.key} className="flex items-center gap-2 px-2">
            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 lg:min-h-9">
              <input
                type="checkbox"
                className={BOX}
                checked={choice.checked}
                onChange={() => {
                  setProblem(null);
                  setChoices((current) =>
                    current.map((c) => (c.key === choice.key ? { ...c, checked: !c.checked } : c)),
                  );
                }}
              />
              {choice.label}
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${choice.label} up`}
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              <ArrowUpIcon aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${choice.label} down`}
              disabled={index === choices.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <ArrowDownIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {problem}
        </p>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" loading={save.isPending}>
          Save columns
        </Button>
      </DialogFooter>
    </form>
  );
};
ChooserForm.displayName = 'ChooserForm';

export interface ColumnChooserDialogProps {
  type: ContentType;
  catalog: ColumnCatalog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when the dialog closes (the Columns button). */
  finalFocus?: React.RefObject<HTMLElement | null>;
}

/**
 * The column chooser (D6): the listable columns as checkboxes with Move up and Move down. Save
 * sends C3 with the checked columns in order; at least one must be checked. A 400 or 403 stays in
 * the dialog. The choice applies to everyone.
 */
export const ColumnChooserDialog: React.FC<ColumnChooserDialogProps> = ({
  type,
  catalog,
  open,
  onOpenChange,
  finalFocus,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent finalFocus={finalFocus}>
      <DialogHeader>
        <DialogTitle>Choose columns</DialogTitle>
        <DialogDescription>
          Pick and order the columns of the {type.name} list. This applies to everyone who views it.
        </DialogDescription>
      </DialogHeader>
      <ChooserForm type={type} catalog={catalog} onSaved={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);
ColumnChooserDialog.displayName = 'ColumnChooserDialog';
