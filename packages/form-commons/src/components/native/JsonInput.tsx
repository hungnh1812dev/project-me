'use client';

import { lazy, Suspense, useImperativeHandle, useRef, useState, type Ref } from 'react';

import type { InputProps, JsonInputConfig } from '../../lib/inputContract';
import { formatJson, parseJson } from '../../lib/json';
import { canFormat, shouldValidate } from '../../lib/jsonEditor';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import type { JsonCodeEditorHandle } from './JsonCodeEditor';

/** CodeMirror loads in its own chunk, on first render of a JSON field. */
const JsonCodeEditor = lazy(() => import('./JsonCodeEditor'));

export type JsonInputProps = Omit<
  InputProps<string, JsonInputConfig>,
  'ref' | 'aria-labelledby'
> & {
  /** The validation message, or `null` when valid. Runs on blur, then on every change. */
  onValidate?: (error: string | null) => void;
  /** The parsed value when the text is valid; `undefined` when invalid or empty. */
  onValueChange?: (value: unknown) => void;
  ref?: Ref<JsonCodeEditorHandle>;
};

/** Placeholder with the editor's footprint while the CodeMirror chunk loads. */
const JsonEditorSkeleton: React.FC = () => (
  <Skeleton data-slot="json-editor-skeleton" aria-hidden="true" className="h-36 w-full" />
);
JsonEditorSkeleton.displayName = 'JsonEditorSkeleton';

/**
 * A controlled CodeMirror JSON editor (lazy-loaded) on the input contract, with validation and a
 * "Format JSON" button. The parent owns the text (`value`); `config` sets `expect`, `rows`, the
 * editor's accessible name (`label`, ids can't cross the shadow root, so `aria-label` is the
 * fallback) and the `description` mirrored into the in-shadow description.
 */
export const JsonInput: React.FC<JsonInputProps> = ({
  value,
  onChange,
  onValidate,
  onValueChange,
  onBlur,
  config,
  required,
  disabled,
  readOnly,
  id,
  name,
  className,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ref,
}) => {
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = value;
  const parse = (next: string) => parseJson(next, { required, expect: config?.expect ?? 'any' });

  const validate = (next: string) => {
    const result = parse(next);
    const message = result.ok ? null : result.message;
    setError(message);
    onValidate?.(message);
  };

  const update = (next: string) => {
    onChange(next);
    const result = parse(next);
    onValueChange?.(result.ok ? result.value : undefined);
    if (shouldValidate(touched)) validate(next);
  };

  const editorRef = useRef<JsonCodeEditorHandle>(null);
  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    get view() {
      return editorRef.current?.view ?? null;
    },
  }));

  /** One replace transaction, undoable like typing; its change reaches `update` via `onChange`. */
  const format = () => {
    const formatted = formatJson(text);
    const view = editorRef.current?.view;
    if (!view) return update(formatted);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: formatted },
      userEvent: 'input.format',
    });
  };

  const invalid = Boolean(error) || ariaInvalid === true || ariaInvalid === 'true';

  return (
    <div data-slot="json-input" className="flex w-full flex-col gap-1">
      <Suspense fallback={<JsonEditorSkeleton />}>
        <JsonCodeEditor
          ref={editorRef}
          id={id}
          name={name}
          className={className}
          value={text}
          onChange={update}
          onBlur={() => {
            setTouched(true);
            validate(text);
            onBlur?.();
          }}
          label={config?.label ?? ariaLabel}
          description={config?.description}
          error={error}
          describedBy={ariaDescribedBy}
          invalid={invalid}
          required={required}
          readOnly={readOnly}
          disabled={disabled}
          rows={config?.rows}
        />
      </Suspense>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={!canFormat(text, { disabled, readOnly })}
        onClick={format}
      >
        Format JSON
      </Button>
    </div>
  );
};
JsonInput.displayName = 'JsonInput';
