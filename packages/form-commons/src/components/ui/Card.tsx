import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

import { CONTROL_FOCUS_RING_ONLY_CLASSES } from '@/components/ui/Control.constants';

/** The transparent border shows as an outline in forced-colours mode. */
const cardVariants = cva(
  'rounded-surface border border-transparent bg-card text-card-foreground shadow-card',
  {
    variants: {
      padding: {
        default: 'p-6',
        compact: 'p-4',
        flush: '',
      },
      isInteractive: {
        true: `transition-shadow duration-(--duration-fast) hover:shadow-card-hover motion-reduce:transition-none ${CONTROL_FOCUS_RING_ONLY_CLASSES}`,
        false: '',
      },
    },
    defaultVariants: {
      padding: 'default',
      isInteractive: false,
    },
  },
);

type CardProps = React.ComponentProps<'div'> &
  Omit<VariantProps<typeof cardVariants>, 'isInteractive'> & {
    /** Adds the hover shadow and the shared focus ring; use with a link or button child. */
    isInteractive?: boolean;
    /** Renders the child element (`section`, `li`, link) instead of a `div`. */
    asChild?: boolean;
  };

function Card({
  className,
  padding = 'default',
  isInteractive = false,
  asChild = false,
  ...props
}: CardProps) {
  const Component = asChild ? Slot.Root : 'div';
  return (
    <Component
      data-slot="card"
      data-padding={padding}
      className={cn(cardVariants({ padding, isInteractive }), className)}
      {...props}
    />
  );
}

export { Card, cardVariants, type CardProps };
