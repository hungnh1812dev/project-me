import type { Ref } from 'react';

import type { FieldControlProps } from '../components/native/Field';
import type { JsonExpect } from './json';

/** Values a `config` may hold: plain JSON, no functions, elements or Dates. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** The shape every input `config` must fit. Optional keys may be left `undefined`. */
export type JsonConfig = { [key: string]: JsonValue | undefined };

/** The value half of every input: the parent owns the value. */
export interface InputValueProps<T> {
  /** The current value. The parent owns it; there is no `defaultValue`. */
  value: T;
  /** Called with the next value (never the DOM event). Set it back as `value`. */
  onChange: (value: T) => void;
  /** Called when focus leaves the control (react-hook-form marks the field touched). */
  onBlur?: () => void;
  /** The form field name, for native form submission. */
  name?: string;
}

/** State flags every input accepts (Field/RHFField also set id and aria-*). */
export interface InputStateProps {
  /** Not focusable or editable, and not submitted. */
  disabled?: boolean;
  /** Shown and focusable, but the value can't change. */
  readOnly?: boolean;
}

/** Names a control used without a `Field`, for example a search box. */
export interface InputLabelProps {
  /** The accessible name when there is no visible label. */
  'aria-label'?: string;
  /** The id of the visible element that names the control. */
  'aria-labelledby'?: string;
}

/** The full public props of an input: value, state, Field wiring, one JSON `config`, `className` and `ref`. */
export type InputProps<T, C extends JsonConfig> = InputValueProps<T> &
  InputStateProps &
  FieldControlProps &
  InputLabelProps & {
    /** The input's options, as plain JSON (no functions, elements or Dates). */
    config?: C;
    /** Extra classes on the control's root. */
    className?: string;
    /** The focusable element, for example for react-hook-form's focus on error. */
    ref?: Ref<HTMLElement>;
  };

/** One choice of a `Select` or `RadioGroup`. */
export type InputOption = { value: string; label: string };

/** Config types for each input. Type aliases (not interfaces) so they fit `JsonConfig`. */
export type InputConfig = {
  type?: string;
  placeholder?: string;
  maxLength?: number;
  minLength?: number;
  autoComplete?: string;
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
  pattern?: string;
  spellCheck?: boolean;
  autoFocus?: boolean;
  min?: number;
  max?: number;
  step?: number;
};
export type PasswordInputConfig = { placeholder?: string; autoComplete?: string };
export type TextareaConfig = { rows?: number; maxLength?: number; placeholder?: string };
export type JsonInputConfig = {
  expect?: JsonExpect;
  rows?: number;
  label?: string;
  description?: string;
};
export type SwitchConfig = Record<string, never>;
export type CheckboxConfig = { indeterminate?: boolean };
export type SelectConfig = { placeholder?: string; options: InputOption[] };
/** `options` is left out when the items come from `RadioGroupItem` children instead. */
export type RadioGroupConfig = { options?: InputOption[]; orientation?: 'horizontal' | 'vertical' };
export type DatePickerConfig = { locale?: string; placeholder?: string };
/** `label` names the group (when no `aria-labelledby`) and its Choose and Remove buttons. */
export type MediaInputConfig = { label?: string };

const isPlainObject = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const isJsonValue = (value: unknown, path: Set<object>): boolean => {
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object':
      break;
    default:
      return false;
  }
  if (path.has(value)) return false;
  path.add(value);
  const ok = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, path))
    : isPlainObject(value) && Object.values(value).every((item) => isJsonValue(item, path));
  path.delete(value);
  return ok;
};

/**
 * True when `value` is a plain object whose values are all JSON (`undefined` allowed only for a
 * top-level optional key). Rejects functions, React elements, Dates, class instances, non-finite
 * numbers, `undefined` inside arrays and cycles.
 */
export const isJsonConfig = (value: unknown): value is JsonConfig => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !isPlainObject(value)
  ) {
    return false;
  }
  const path = new Set<object>([value]);
  return Object.values(value).every((item) => item === undefined || isJsonValue(item, path));
};
