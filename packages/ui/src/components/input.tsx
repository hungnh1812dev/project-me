'use client';

import { cn } from '../lib/cn';
import { controlClasses } from './variants';

type InputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  type?: 'text' | 'email' | 'password' | 'search' | 'url' | 'tel' | 'number';
  /** A decorative icon before the text (give it `aria-hidden`). */
  leading?: React.ReactNode;
  /** A control after the text, such as the password show/hide toggle. */
  trailing?: React.ReactNode;
};

const Input: React.FC<InputProps> = ({ className, type = 'text', leading, trailing, ...props }) => {
  const input = (
    <input
      data-slot="input"
      type={type}
      className={cn(
        controlClasses,
        'h-11 px-3 py-2 lg:h-10',
        leading != null && 'pl-10',
        trailing != null && 'pr-12',
        className,
      )}
      {...props}
    />
  );
  if (leading == null && trailing == null) return input;

  return (
    <div data-slot="input-group" className="relative w-full">
      {leading != null && (
        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center [&_svg]:size-4">
          {leading}
        </span>
      )}
      {input}
      {trailing != null && (
        <span className="absolute inset-y-0 right-0 flex items-center">{trailing}</span>
      )}
    </div>
  );
};
Input.displayName = 'Input';

export { Input, type InputProps };
