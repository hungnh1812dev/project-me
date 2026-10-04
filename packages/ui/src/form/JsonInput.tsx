'use client';

import { lazy, Suspense, useImperativeHandle, useRef, useState } from 'react';

import { Button } from '../components/button';
import { Skeleton } from '../components/skeleton';
import { formatJson, parseJson, type JsonExpect } from '../lib/json';
import { canFormat, shouldValidate } from '../lib/jsonEditor';
import type { JsonCodeEditorHandle } from './JsonCodeEditor';

/** CodeMirror loads in its own chunk, on first render of a JSON field. */
const JsonCodeEditor = lazy(() => import('./JsonCodeEditor'));

export interface JsonInputProps {
  /** The JSON text (controlled). */
  value?: string;
  /** The initial JSON text (uncontrolled). */
  defaultValue?: string;
  onChange?: (text: string) => void;
  /** The validation message, or `null` when valid. Runs on blur, then on every change. */
  onValidate?: (error: string | null) => void;
  /** The parsed value when the text is valid; `undefined` when invalid or empty. */
  onValueChange?: (value: unknown) => void;
  onBlur?: () => void;
  expect?: JsonExpect;
  /** The accessible name of the editor (the field label; ids can't cross the shadow root). */
  label?: string;
  /** Text mirrored into the editor's in-shadow description. */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Minimum height in lines. */
  rows?: number;
  id?: string;
  name?: string;
  className?: string;
  /** Set by `Field` when it shows an error. */
  'aria-invalid'?: boolean | 'true' | 'false';
  /** Set by `Field`; ignored, because ids outside the shadow root can't be referenced from it. */
  'aria-describedby'?: string;
  'aria-required'?: boolean | 'true' | 'false';
  ref?: React.Ref<JsonCodeEditorHandle>;
}

/** Placeholder with the editor's footprint while the CodeMirror chunk loads. */
const JsonEditorSkeleton: React.FC = () => (
  <Skeleton data-slot="json-editor-skeleton" aria-hidden="true" className="h-36 w-full" />
);
JsonEditorSkeleton.displayName = 'JsonEditorSkeleton';

/** A CodeMirror JSON editor (lazy-loaded) with validation and a "Format JSON" button. */
export const JsonInput: React.FC<JsonInputProps> = ({
  value,
  defaultValue = '',
  onChange,
  onValidate,
  onValueChange,
  onBlur,
  expect = 'any',
  label,
  description,
  required,
  disabled,
  readOnly,
  rows,
  id,
  name,
  className,
  'aria-invalid': ariaInvalid,
  ref,
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
          label={label}
          description={description}
          error={error}
          invalid={invalid}
          required={required}
          readOnly={readOnly}
          disabled={disabled}
          rows={rows}
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
