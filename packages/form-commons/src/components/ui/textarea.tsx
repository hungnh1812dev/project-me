'use client';

import { useId, type Ref } from 'react';

import { cn } from '../../lib/cn';
import type { InputProps, TextareaConfig } from '../../lib/inputContract';
import { controlClasses } from './variants';

type TextareaProps = Omit<InputProps<string, TextareaConfig>, 'ref'> & {
  ref?: Ref<HTMLTextAreaElement>;
};

/**
 * Controlled multi-line input on the input contract: the parent owns `value` and gets the next
 * string through `onChange`. With `config.maxLength` it shows a live "n / max" count of `value`.
 */
const Textarea: React.FC<TextareaProps> = ({
  value,
  onChange,
  config,
  className,
  'aria-describedby': describedBy,
  ...field
}) => {
  const countId = useId();
  const maxLength = config?.maxLength;
  const hasCount = maxLength !== undefined;

  const textarea = (
    <textarea
      data-slot="textarea"
      rows={config?.rows ?? 4}
      maxLength={maxLength}
      placeholder={config?.placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-describedby={[describedBy, hasCount && countId].filter(Boolean).join(' ') || undefined}
      className={cn(controlClasses, 'min-h-20 resize-y px-3 py-2', className)}
      {
        ...field /* onBlur, name, ref, id, disabled, readOnly, required, aria-* only */
      }
    />
  );
  if (!hasCount) return textarea;

  const length = value.length;
  const atLimit = length >= maxLength;
  return (
    <div data-slot="textarea-group" className="flex w-full flex-col gap-1">
      {textarea}
      <p
        id={countId}
        aria-live={atLimit ? 'polite' : 'off'}
        className={cn(
          'self-end text-sm tabular-nums',
          length >= maxLength * 0.9 ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {length} / {maxLength}
      </p>
    </div>
  );
};
Textarea.displayName = 'Textarea';

export { Textarea, type TextareaProps };
