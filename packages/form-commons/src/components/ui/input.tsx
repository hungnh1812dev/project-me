'use client';

import type { Ref } from 'react';

import { cn } from '../../lib/cn';
import type { InputProps as ContractProps, InputConfig } from '../../lib/inputContract';
import { controlClasses } from './variants';

type InputProps = Omit<ContractProps<string, InputConfig>, 'ref'> & {
  ref?: Ref<HTMLInputElement>;
  /** A decorative icon before the text (give it `aria-hidden`). */
  leading?: React.ReactNode;
  /** A control after the text, such as the password show/hide toggle. */
  trailing?: React.ReactNode;
};

/**
 * Controlled text input on the input contract: the parent owns `value` and gets the next string
 * through `onChange`. `config` carries the JSON-only native options (`type` defaults to "text").
 */
const Input: React.FC<InputProps> = ({
  value,
  onChange,
  config,
  leading,
  trailing,
  className,
  ...field
}) => {
  const input = (
    <input
      data-slot="input"
      type={config?.type ?? 'text'}
      placeholder={config?.placeholder}
      maxLength={config?.maxLength}
      minLength={config?.minLength}
      autoComplete={config?.autoComplete}
      inputMode={config?.inputMode}
      pattern={config?.pattern}
      spellCheck={config?.spellCheck}
      autoFocus={config?.autoFocus}
      min={config?.min}
      max={config?.max}
      step={config?.step}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        controlClasses,
        'h-11 px-3 py-2 lg:h-10',
        leading != null && 'pl-10',
        trailing != null && 'pr-12',
        className,
      )}
      {
        ...field /* onBlur, name, ref, id, disabled, readOnly, required, aria-* only */
      }
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
