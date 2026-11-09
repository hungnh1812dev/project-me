import * as React from 'react';
import { cn } from 'cn';

import { CONTROL_FOCUS_RING_ONLY_CLASSES } from '@/components/ui/Control.constants';

import { Button, type ButtonProps } from './Button';
import { Tooltip, TooltipContent, TooltipTrigger } from './Tooltip';

type IconButtonProps = Omit<ButtonProps, 'size' | 'children' | 'aria-label' | 'asChild'> & {
  /** The accessible name and the tooltip text. */
  label: string;
  tooltipSide?: React.ComponentProps<typeof TooltipContent>['side'];
  children: React.ReactNode;
};

/**
 * Icon-only button with a required label. A disabled button cannot take focus
 * or hover, so its tooltip hangs on a focusable wrapper instead.
 */
function IconButton({
  label,
  tooltipSide,
  children,
  disabled,
  className,
  ...props
}: IconButtonProps) {
  const button = (
    <Button
      size="icon"
      aria-label={label}
      disabled={disabled}
      className={cn(disabled && 'pointer-events-none', className)}
      {...props}
    >
      {children}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          <span
            data-slot="icon-button-wrapper"
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a disabled button cannot be focused, so this wrapper carries the tooltip
            tabIndex={0}
            className={cn('rounded-control inline-flex', CONTROL_FOCUS_RING_ONLY_CLASSES)}
          >
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}

export { IconButton, type IconButtonProps };
