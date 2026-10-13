'use client';

import { useId } from 'react';

import { Button, type ButtonProps } from '../components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip';
import { cn } from '../lib/cn';
import type { Decision } from '../lib/decision';

export type GatedButtonProps = ButtonProps & {
  /** From `useCan`. A denial keeps the button visible, focusable and inert (D5). */
  decision: Decision;
  /**
   * Shown on hover and focus while allowed, for example an icon button's name. A denial shows its
   * reason instead.
   */
  tooltip?: string;
};

const FALLBACK_REASON = "You don't have permission to do this.";

/**
 * A `Button` gated by an ABAC decision (AC-5). When denied it is `aria-disabled="true"` but still
 * focusable, explains the decision's reason through a tooltip and `aria-describedby`, and ignores
 * activation (click, Enter, form submit). An allowed button with a `tooltip` shows it on hover and
 * focus.
 */
export const GatedButton: React.FC<GatedButtonProps> = ({
  decision,
  tooltip,
  onClick,
  className,
  ...props
}) => {
  const reasonId = useId();
  if (decision.allowed) {
    const button = <Button onClick={onClick} className={className} {...props} />;
    if (tooltip === undefined) return button;
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

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
