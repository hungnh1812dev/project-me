import { useRef } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@abyss/form-commons';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  /** Names the action ("Unpublish", "Leave without saving"), never "OK". */
  confirmLabel: string;
  confirmVariant: 'destructive' | 'warning';
  isRunning?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Where focus goes after the dialog closes; the dialog is not a `DialogTrigger`, so Radix cannot restore it. */
  onCloseFocus?: () => void;
}

/** A two-button confirmation: Cancel takes focus first, the confirm button names the action. */
export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmVariant,
  isRunning = false,
  onConfirm,
  onCancel,
  onCloseFocus,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={(isOpen) => (isOpen ? undefined : onCancel())}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseFocus?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelRef} type="button" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={confirmVariant} loading={isRunning} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
