import { parseJson } from '@/utils/json';

import { readMediaValue } from './mediaValue';
import { fieldKind } from './schema';
import type { DocumentData, FieldDefinition } from './types';

/**
 * The react-hook-form values of a schema form (D3). They differ from `DocumentData` only where the
 * UI needs text: a number is its input text, json is its text (two-space indented), and media is
 * `MediaAsset | string | null` (D4). Components are nested objects, repeatables are arrays.
 */
export type FormValues = Record<string, unknown>;

export type { MediaFormValue } from './mediaValue';

/** The message a number field shows when its text isn't a finite number. */
export const NUMBER_ERROR = 'Enter a number.';

const NUMBER_TEXT = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The finite number a text holds, `null` for empty text, or `undefined` when it isn't a number. */
function readNumber(value: unknown): number | null | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const text = asText(value).trim();
  if (text === '') return null;
  if (!NUMBER_TEXT.test(text)) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

function formValue(field: FieldDefinition, value: unknown): unknown {
  switch (fieldKind(field)) {
    case 'text':
    case 'richtext':
      return asText(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
    case 'boolean':
      return value === true;
    case 'json':
      return value === undefined ? '' : JSON.stringify(value, null, 2);
    case 'media':
      return readMediaValue(value);
    case 'component':
      return toFormValues(field.fields ?? [], isRecord(value) ? value : null);
    case 'repeatable':
      return Array.isArray(value)
        ? value.map((entry) => toFormValues(field.fields ?? [], isRecord(entry) ? entry : null))
        : [];
    default:
      // A type the client doesn't know keeps its value, to be sent back unchanged.
      return value;
  }
}

/**
 * The form values of a document (or a component value): one entry per schema field, in schema
 * order. System fields and any other key outside the schema are left out. A missing document gives
 * the empty values.
 */
export function toFormValues(
  fields: readonly FieldDefinition[],
  doc: DocumentData | null | undefined,
): FormValues {
  const source = doc ?? {};
  const values: FormValues = {};
  for (const field of fields) values[field.name] = formValue(field, source[field.name]);
  return values;
}

/** The form values of a new document. */
export function emptyValues(fields: readonly FieldDefinition[]): FormValues {
  return toFormValues(fields, null);
}

/** The form values of a new repeatable entry, from the component's fields. */
export function emptyEntry(componentFields: readonly FieldDefinition[]): FormValues {
  return emptyValues(componentFields);
}

function documentValue(field: FieldDefinition, value: unknown): unknown {
  switch (fieldKind(field)) {
    case 'text':
    case 'richtext':
      return asText(value);
    case 'number':
      return readNumber(value) ?? null;
    case 'boolean':
      return value === true;
    case 'json': {
      const result = parseJson(asText(value));
      return result.ok && result.value !== undefined ? result.value : null;
    }
    case 'media':
      // The full MediaAsset (D4). MediaField swaps a resolved id for its asset; an id it can't
      // resolve ("File not found") is sent back as it came.
      return readMediaValue(value);
    case 'component':
      return toDocumentData(field.fields ?? [], isRecord(value) ? value : {});
    case 'repeatable':
      return Array.isArray(value)
        ? value.map((entry) => toDocumentData(field.fields ?? [], isRecord(entry) ? entry : {}))
        : [];
    default:
      return value;
  }
}

/**
 * The `DocumentData` a save sends: exactly the schema's fields, converted back from form values.
 * Empty number text becomes `null`, json text is parsed (empty becomes `null`), media is the full
 * `MediaAsset` (or an unresolved `documentId`, or `null`), and an unknown type's value is sent
 * back unchanged. A system field is never included.
 */
export function toDocumentData(
  fields: readonly FieldDefinition[],
  values: FormValues,
): DocumentData {
  const data: DocumentData = {};
  for (const field of fields) data[field.name] = documentValue(field, values[field.name]);
  return data;
}

/** The react-hook-form rules of a field. */
export interface FieldRules {
  validate?: (value: unknown) => true | string;
}

const NUMBER_RULES: FieldRules = {
  validate: (value) => (readNumber(value) === undefined ? NUMBER_ERROR : true),
};

const JSON_RULES: FieldRules = {
  validate: (value) => {
    const result = parseJson(asText(value));
    return result.ok ? true : result.message;
  },
};

/**
 * The client-side checks of a field (Assumption 2): a number must be finite and json must parse.
 * Other fields have none; the backend's 400 messages cover the rest.
 */
export function rulesFor(field: FieldDefinition): FieldRules {
  switch (fieldKind(field)) {
    case 'number':
      return NUMBER_RULES;
    case 'json':
      return JSON_RULES;
    default:
      return {};
  }
}
