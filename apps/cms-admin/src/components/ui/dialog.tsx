import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

// Vendored from shadcn/ui (base-nova) and adapted: arrow components, semantic tokens, 44px touch
// targets below `lg`, and `aria-modal="true"` on the popup (Base UI does not set it).

const Dialog: React.FC<DialogPrimitive.Root.Props> = (props) => (
  <DialogPrimitive.Root data-slot="dialog" {...props} />
);
Dialog.displayName = 'Dialog';

const DialogTrigger: React.FC<DialogPrimitive.Trigger.Props> = (props) => (
  <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
);
DialogTrigger.displayName = 'DialogTrigger';

const DialogClose: React.FC<DialogPrimitive.Close.Props> = (props) => (
  <DialogPrimitive.Close data-slot="dialog-close" {...props} />
);
DialogClose.displayName = 'DialogClose';

/** The dimmed page behind an open dialog. Shared with `alert-dialog`. */
export const overlayClasses =
  'fixed inset-0 z-50 bg-background/80 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs';

/** A centred card, full width minus a gutter on phones. Shared with `alert-dialog`. */
export const popupClasses =
  'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border bg-popover p-6 text-sm text-popover-foreground shadow-lg outline-none transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0';

type DialogContentProps = DialogPrimitive.Popup.Props & {
  /** Renders an icon-only Close button in the top-right corner. */
  showCloseButton?: boolean;
};

const DialogContent: React.FC<DialogContentProps> = ({
  className,
  children,
  showCloseButton = true,
  ...props
}) => (
  <DialogPrimitive.Portal data-slot="dialog-portal">
    <DialogPrimitive.Backdrop data-slot="dialog-overlay" className={overlayClasses} />
    <DialogPrimitive.Popup
      data-slot="dialog-content"
      aria-modal="true"
      className={cn(popupClasses, className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          data-slot="dialog-close"
          render={
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2"
              aria-label="Close"
            />
          }
        >
          <XIcon aria-hidden="true" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Popup>
  </DialogPrimitive.Portal>
);
DialogContent.displayName = 'DialogContent';

const DialogHeader: React.FC<React.ComponentProps<'div'>> = ({ className, ...props }) => (
  <div
    data-slot="dialog-header"
    className={cn('flex flex-col gap-1.5 pr-8', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter: React.FC<React.ComponentProps<'div'>> = ({ className, ...props }) => (
  <div
    data-slot="dialog-footer"
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle: React.FC<DialogPrimitive.Title.Props> = ({ className, ...props }) => (
  <DialogPrimitive.Title
    data-slot="dialog-title"
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription: React.FC<DialogPrimitive.Description.Props> = ({
  className,
  ...props
}) => (
  <DialogPrimitive.Description
    data-slot="dialog-description"
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
);
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
