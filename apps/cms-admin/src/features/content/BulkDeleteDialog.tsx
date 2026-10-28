import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@abyss/form-commons';

import { COPY } from '../../config/Copy.constants';

const copy = COPY.content.bulk.deleteDialog;

/** Confirms a bulk delete; the button says how many documents go. */
export function BulkDeleteDialog({
  count,
  draftAndPublish,
  open,
  onClose,
  onConfirm,
  onCloseAutoFocus,
}: {
  count: number;
  draftAndPublish: boolean;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{copy.title(count)}</DialogTitle>
          <DialogDescription>
            {copy.description(draftAndPublish)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">{copy.cancel}</Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {copy.confirm(count)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
