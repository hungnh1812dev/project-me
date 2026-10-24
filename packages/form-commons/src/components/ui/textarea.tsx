import * as React from 'react';
import { cn } from 'cn';
import {
  CONTROL_FOCUS_CLASSES,
  CONTROL_INVALID_CLASSES,
} from '@/components/ui/control.constants';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-20 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base text-foreground transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        CONTROL_FOCUS_CLASSES,
        CONTROL_INVALID_CLASSES,
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
