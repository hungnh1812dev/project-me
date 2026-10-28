import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@abyss/form-commons';

/**
 * Modal for the two-factor flows, on the kit `Dialog`. Mount it to open,
 * unmount to close: no `forceMount`, so the TOTP secret and temp token leave
 * the DOM with it. Only Esc and the caller's own cancel button close it; an
 * outside click or an autofill overlay taking focus must not drop a code
 * entry halfway.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Esc, or the caller's own cancel button. */
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        {...(description === undefined
          ? { 'aria-describedby': undefined }
          : {})}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description === undefined ? null : (
            <DialogDescription asChild>
              <div>{description}</div>
            </DialogDescription>
          )}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export const ModalActions = DialogFooter;
