import { useId, useState } from 'react';

import { controlClasses } from '@/components/ui/variants';
import { cn } from '@/utils/cn';

type TextareaProps = React.ComponentProps<'textarea'>;

/** Multi-line input. With `maxLength` it shows a live "n / max" count. */
const Textarea: React.FC<TextareaProps> = ({
  className,
  rows = 4,
  maxLength,
  value,
  defaultValue,
  onChange,
  'aria-describedby': describedBy,
  ...props
}) => {
  const countId = useId();
  const [uncontrolledLength, setUncontrolledLength] = useState(
    () => String(defaultValue ?? '').length,
  );
  const length = value === undefined ? uncontrolledLength : String(value).length;
  const hasCount = maxLength !== undefined;

  const textarea = (
    <textarea
      data-slot="textarea"
      rows={rows}
      maxLength={maxLength}
      value={value}
      defaultValue={defaultValue}
      onChange={(event) => {
        setUncontrolledLength(event.target.value.length);
        onChange?.(event);
      }}
      aria-describedby={[describedBy, hasCount && countId].filter(Boolean).join(' ') || undefined}
      className={cn(controlClasses, 'min-h-20 resize-y px-3 py-2', className)}
      {...props}
    />
  );
  if (!hasCount) return textarea;

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
