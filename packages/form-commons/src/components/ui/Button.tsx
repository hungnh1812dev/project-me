import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

/**
 * Variants follow the action's meaning (ui-direction §2):
 * primary = the one main action of a view, secondary = alternatives,
 * success = approve/complete, warning = risky but reversible,
 * destructive = irreversible (always behind a confirm), ghost/link = tertiary.
 */
const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer appearance-none border border-transparent bg-transparent items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover',
        secondary:
          'border-input bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-hover',
        success:
          'bg-success text-success-foreground hover:bg-success-hover active:bg-success-hover',
        warning:
          'border-warning bg-warning-soft text-warning-strong hover:bg-warning/20 active:bg-warning/30',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive-hover active:bg-destructive-hover focus-visible:ring-destructive/40',
        ghost:
          'text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        md: 'h-9 px-4 py-2 has-[>svg]:px-3',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner, keeps the button's width and blocks repeat clicks. */
    loading?: boolean;
  };

function Button({
  className,
  variant = 'secondary',
  size = 'md',
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">
            {children}
          </span>
          <span
            data-slot="button-spinner"
            aria-hidden="true"
            className="absolute size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        </>
      ) : (
        children
      )}
    </button>
  );
}

export { Button, buttonVariants, type ButtonProps };
