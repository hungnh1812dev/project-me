import * as React from 'react';
import { cn } from 'cn';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

/** Hover delay before a tooltip opens (ui-direction: shown after a pause, not on a pass-over). */
export const TOOLTIP_DELAY_MS = 700;

/** Each Tooltip carries its own provider, so apps need no app-level one. */
function Tooltip({
  delayDuration = TOOLTIP_DELAY_MS,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipPrimitive.Provider>
  );
}

function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-foreground text-background rounded-item shadow-overlay data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out z-50 max-w-xs px-2.5 py-1.5 text-xs motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipTrigger };
