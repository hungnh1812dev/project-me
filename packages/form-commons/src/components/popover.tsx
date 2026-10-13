'use client';

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { cn } from '../lib/cn';

// Vendored from shadcn/ui (base-nova) and adapted: arrow components and semantic tokens. Base UI
// positions the popup through CSSOM only (no `style` attribute), so it renders under the CSP's
// `style-src 'self'`. Escape and an outside click close it, and focus returns to the trigger.

const Popover: React.FC<PopoverPrimitive.Root.Props> = (props) => (
  <PopoverPrimitive.Root data-slot="popover" {...props} />
);
Popover.displayName = 'Popover';

const PopoverTrigger: React.FC<PopoverPrimitive.Trigger.Props> = (props) => (
  <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
);
PopoverTrigger.displayName = 'PopoverTrigger';

const PopoverClose: React.FC<PopoverPrimitive.Close.Props> = (props) => (
  <PopoverPrimitive.Close data-slot="popover-close" {...props} />
);
PopoverClose.displayName = 'PopoverClose';

type PopoverContentProps = PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>;

const PopoverContent: React.FC<PopoverContentProps> = ({
  className,
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  ...props
}) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Positioner
      className="isolate z-50"
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
    >
      <PopoverPrimitive.Popup
        data-slot="popover-content"
        className={cn(
          'bg-popover text-popover-foreground data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 z-50 flex max-h-(--available-height) w-72 max-w-[calc(100vw-2rem)] origin-(--transform-origin) flex-col gap-4 overflow-y-auto rounded-lg border p-4 text-sm shadow-md duration-100 outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>
);
PopoverContent.displayName = 'PopoverContent';

const PopoverHeader: React.FC<React.ComponentProps<'div'>> = ({ className, ...props }) => (
  <div data-slot="popover-header" className={cn('flex flex-col gap-1', className)} {...props} />
);
PopoverHeader.displayName = 'PopoverHeader';

const PopoverTitle: React.FC<PopoverPrimitive.Title.Props> = ({ className, ...props }) => (
  <PopoverPrimitive.Title
    data-slot="popover-title"
    className={cn('text-foreground font-medium', className)}
    {...props}
  />
);
PopoverTitle.displayName = 'PopoverTitle';

const PopoverDescription: React.FC<PopoverPrimitive.Description.Props> = ({
  className,
  ...props
}) => (
  <PopoverPrimitive.Description
    data-slot="popover-description"
    className={cn('text-muted-foreground', className)}
    {...props}
  />
);
PopoverDescription.displayName = 'PopoverDescription';

export {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
