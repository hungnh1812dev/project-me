import { useId } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Decision } from '@/features/auth/permissions/policies';
import { cn } from '@/utils/cn';

export type GatedButtonProps = ButtonProps & {
  /** From `useCan`. A denial keeps the button visible, focusable and inert (D5). */
  decision: Decision;
};

const FALLBACK_REASON = "You don't have permission to do this.";

/**
 * A `Button` gated by an ABAC decision (AC-5). When denied it is `aria-disabled="true"` but still
 * focusable, explains the decision's reason through a tooltip and `aria-describedby`, and ignores
 * activation (click, Enter, form submit).
 */
export const GatedButton: React.FC<GatedButtonProps> = ({
  decision,
  onClick,
  className,
  ...props
}) => {
  const reasonId = useId();
  if (decision.allowed) return <Button onClick={onClick} className={className} {...props} />;

  const reason = decision.reason ?? FALLBACK_REASON;
  const describedBy = [props['aria-describedby'], reasonId].filter(Boolean).join(' ');

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            {...props}
            aria-disabled="true"
            aria-describedby={describedBy}
            className={cn('cursor-not-allowed opacity-50', className)}
            onClick={(event) => event.preventDefault()}
          />
        }
      />
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
};
GatedButton.displayName = 'GatedButton';
