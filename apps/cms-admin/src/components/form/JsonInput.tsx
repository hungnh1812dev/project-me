import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea, type TextareaProps } from '@/components/ui/textarea';
import { cn } from '@/utils/cn';
import { formatJson, parseJson, type JsonExpect } from '@/utils/json';

export type JsonInputProps = Omit<TextareaProps, 'value' | 'defaultValue' | 'onChange'> & {
  /** The JSON text (controlled). */
  value?: string;
  /** The initial JSON text (uncontrolled). */
  defaultValue?: string;
  onChange?: (text: string) => void;
  /** The validation message, or `null` when valid. Runs on blur, then on every change. */
  onValidate?: (error: string | null) => void;
  /** The parsed value when the text is valid; `undefined` when invalid or empty. */
  onValueChange?: (value: unknown) => void;
  expect?: JsonExpect;
};

/** A monospace textarea for JSON text with validation and a "Format JSON" button. */
export const JsonInput: React.FC<JsonInputProps> = ({
  value,
  defaultValue = '',
  onChange,
  onValidate,
  onValueChange,
  expect = 'any',
  required,
  disabled,
  className,
  onBlur,
  ...props
}) => {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = value ?? uncontrolled;
  const parse = (next: string) => parseJson(next, { required, expect });

  const validate = (next: string) => {
    const result = parse(next);
    const message = result.ok ? null : result.message;
    setError(message);
    onValidate?.(message);
  };

  const update = (next: string) => {
    setUncontrolled(next);
    onChange?.(next);
    const result = parse(next);
    onValueChange?.(result.ok ? result.value : undefined);
    if (touched) validate(next);
  };

  const canFormat = !disabled && text.trim() !== '' && parseJson(text).ok;

  return (
    <div data-slot="json-input" className="flex w-full flex-col gap-1">
      <Textarea
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        aria-invalid={error ? true : undefined}
        {...props}
        required={required}
        disabled={disabled}
        value={text}
        onChange={(event) => update(event.target.value)}
        onBlur={(event) => {
          setTouched(true);
          validate(text);
          onBlur?.(event);
        }}
        className={cn('font-mono', className)}
      />
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={!canFormat}
        onClick={() => update(formatJson(text))}
      >
        Format JSON
      </Button>
    </div>
  );
};
JsonInput.displayName = 'JsonInput';
