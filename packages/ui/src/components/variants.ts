import { cva } from 'class-variance-authority';

// Touch targets are at least 44px below 1024px (`lg`), denser on desktop.
export const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        default: 'border-primary-ink bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'text-primary-ink underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-11 px-3 lg:h-8',
        default: 'h-11 px-4 lg:h-9',
        lg: 'h-11 px-6 text-base lg:h-10',
        icon: 'size-11 lg:size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

/** Shared control look: 16px text, `input` border, ring focus, muted disabled, destructive invalid. */
export const controlClasses =
  'w-full min-w-0 rounded-md border border-input bg-background text-base text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive aria-invalid:focus-visible:outline-destructive';
