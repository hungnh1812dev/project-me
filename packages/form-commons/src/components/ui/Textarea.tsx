import * as React from 'react';
import { cn } from 'cn';

import { CONTROL_FOCUS_CLASSES, CONTROL_INVALID_CLASSES } from '@/components/ui/Control.constants';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input bg-card text-foreground selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground rounded-control duration-fast min-h-20 w-full min-w-0 border px-3 py-2 text-base transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        CONTROL_FOCUS_CLASSES,
        CONTROL_INVALID_CLASSES,
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
