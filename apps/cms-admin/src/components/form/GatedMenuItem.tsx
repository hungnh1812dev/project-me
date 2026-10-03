import { useId } from 'react';

import { DropdownMenuItem } from '@repo/ui/components/dropdown-menu';
import { cn } from '@repo/ui/lib/cn';

import type { Decision } from '@/features/auth/permissions/policies';

export type GatedMenuItemProps = React.ComponentProps<typeof DropdownMenuItem> & {
  /** A denial keeps the item in the menu, `aria-disabled`, with the reason as its description. */
  decision: Decision;
};

const FALLBACK_REASON = "You don't have permission to do this.";
/** 44px rows below `lg`, denser on desktop (as in the user menu). */
const ROW = 'min-h-11 px-2 lg:min-h-8';

/**
 * A menu item gated by an ABAC decision (the menu twin of `GatedButton`). When denied it stays
 * reachable with the arrow keys, is `aria-disabled`, shows the reason under its label (also its
 * accessible description) and ignores activation.
 */
export const GatedMenuItem: React.FC<GatedMenuItemProps> = ({
  decision,
  className,
  children,
  onClick,
  ...props
}) => {
  const reasonId = useId();
  if (decision.allowed)
    return (
      <DropdownMenuItem className={cn(ROW, className)} onClick={onClick} {...props}>
        {children}
      </DropdownMenuItem>
    );
  return (
    <DropdownMenuItem
      {...props}
      disabled
      aria-describedby={reasonId}
      className={cn(ROW, 'flex-col items-start gap-0.5 py-1.5', className)}
    >
      <span className="flex items-center gap-1.5">{children}</span>
      <span id={reasonId} className="text-xs text-muted-foreground">
        {decision.reason ?? FALLBACK_REASON}
      </span>
    </DropdownMenuItem>
  );
};
GatedMenuItem.displayName = 'GatedMenuItem';
