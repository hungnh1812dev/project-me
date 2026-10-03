import { useEffect, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmDialogProps {
  /** Opens the dialog; focus returns to it on close. Omit it and use `open` to control the dialog. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Names the target, for example "Delete role "Writer"?". */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A verb label, for example "Delete role". */
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * Runs the action. Resolving closes the dialog. Rejecting keeps it open so the caller can show
   * `error` (for example a mutation's message); the rejection itself is not rethrown.
   */
  onConfirm: () => Promise<unknown>;
  /** The server error, shown inside the dialog with `role="alert"`. */
  error?: React.ReactNode;
  /** Extra content between the description and the buttons, such as a conflict summary. */
  children?: React.ReactNode;
  /**
   * Hides the confirm button, leaving only Cancel (give it a `cancelLabel` such as "Close"), for a
   * state where the action can no longer run, such as a delete conflict. Turning it on moves focus
   * to Cancel.
   */
  hideConfirm?: boolean;
  /**
   * Where focus goes when the dialog closes (Base UI `finalFocus`). By default it returns to the
   * element that opened the dialog; pass a function when that element may be gone, such as a row
   * the action deleted.
   */
  finalFocus?: React.ComponentProps<typeof AlertDialogContent>['finalFocus'];
}

/**
 * Confirms a destructive or irreversible action in a modal `alertdialog` (AC-7, AC-8). Cancel gets
 * the initial focus, the confirm button is destructive and shows `loading` while `onConfirm` runs,
 * and the dialog cannot be submitted twice or dismissed while the action is pending.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  error,
  children,
  hideConfirm = false,
  finalFocus,
}) => {
  const [innerOpen, setInnerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const open = openProp ?? innerOpen;
  const hasError = error != null && error !== false && error !== '';

  // The confirm button had focus when it was clicked; keep focus inside the dialog once it goes.
  useEffect(() => {
    if (hideConfirm) cancelRef.current?.focus();
  }, [hideConfirm]);

  const setOpen = (next: boolean) => {
    if (pendingRef.current) return;
    if (openProp === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };

  const confirm = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    let done = false;
    try {
      await onConfirm();
      done = true;
    } catch {
      // The caller shows the failure through `error`.
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
    if (done) setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogContent initialFocus={cancelRef} finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description != null && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        {hasError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button ref={cancelRef} variant="outline" />}>
            {cancelLabel}
          </AlertDialogClose>
          {!hideConfirm && (
            <Button variant="destructive" loading={pending} onClick={() => void confirm()}>
              {confirmLabel}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
ConfirmDialog.displayName = 'ConfirmDialog';
