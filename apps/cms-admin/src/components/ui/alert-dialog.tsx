import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';

import { cn } from '@repo/ui/lib/cn';

import { overlayClasses, popupClasses } from '@/components/ui/dialog';

// Vendored from shadcn/ui (base-nova) and adapted like `dialog`. The popup has
// `role="alertdialog"` and `aria-modal="true"`; it does not close on an outside click.

const AlertDialog: React.FC<AlertDialogPrimitive.Root.Props> = (props) => (
  <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
);
AlertDialog.displayName = 'AlertDialog';

const AlertDialogTrigger: React.FC<AlertDialogPrimitive.Trigger.Props> = (props) => (
  <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
);
AlertDialogTrigger.displayName = 'AlertDialogTrigger';

/** Closes the dialog. Render it as a `Button` for the Cancel action. */
const AlertDialogClose: React.FC<AlertDialogPrimitive.Close.Props> = (props) => (
  <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
);
AlertDialogClose.displayName = 'AlertDialogClose';

const AlertDialogContent: React.FC<AlertDialogPrimitive.Popup.Props> = ({
  className,
  ...props
}) => (
  <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal">
    <AlertDialogPrimitive.Backdrop data-slot="alert-dialog-overlay" className={overlayClasses} />
    <AlertDialogPrimitive.Popup
      data-slot="alert-dialog-content"
      aria-modal="true"
      className={cn(popupClasses, 'max-w-md', className)}
      {...props}
    />
  </AlertDialogPrimitive.Portal>
);
AlertDialogContent.displayName = 'AlertDialogContent';

const AlertDialogHeader: React.FC<React.ComponentProps<'div'>> = ({ className, ...props }) => (
  <div
    data-slot="alert-dialog-header"
    className={cn('flex flex-col gap-1.5', className)}
    {...props}
  />
);
AlertDialogHeader.displayName = 'AlertDialogHeader';

const AlertDialogFooter: React.FC<React.ComponentProps<'div'>> = ({ className, ...props }) => (
  <div
    data-slot="alert-dialog-footer"
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
);
AlertDialogFooter.displayName = 'AlertDialogFooter';

const AlertDialogTitle: React.FC<AlertDialogPrimitive.Title.Props> = ({ className, ...props }) => (
  <AlertDialogPrimitive.Title
    data-slot="alert-dialog-title"
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
);
AlertDialogTitle.displayName = 'AlertDialogTitle';

const AlertDialogDescription: React.FC<AlertDialogPrimitive.Description.Props> = ({
  className,
  ...props
}) => (
  <AlertDialogPrimitive.Description
    data-slot="alert-dialog-description"
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
);
AlertDialogDescription.displayName = 'AlertDialogDescription';

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
};
