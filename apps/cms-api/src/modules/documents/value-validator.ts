import { BadRequestException } from '@nestjs/common';

import { sanitizeRichtext } from '../../common/sanitize/richtext.sanitizer';
import { joinFieldPath } from '../access/field-paths';
import type { FieldSelection } from '../access/policy-evaluator';
import type { ScalarFieldType } from '../content-engine/definition.schema';
import type { TableNode } from '../content-engine/registry.service';
import {
  type ComponentInput,
  type FieldValues,
  isUuid,
  type TreeInput,
} from '../content-engine/tree-input';
import { coerceFilterValue } from './document-filter';
import {
  DOCUMENT_ERROR_CODES,
  DOCUMENT_ERROR_MESSAGES,
  INT4_MAX,
} from './documents.constants';

export type WriteMode = 'create' | 'update';

export interface TreeValidationOptions {
  mode: WriteMode;
  /** Fields the actor may write: a missing required field only counts when the actor could have sent it. */
  writable: FieldSelection;
}

const DECIMAL_STRING = /^-?\d{1,30}(?:\.\d{1,12})?$/;

/**
 * Checks one value against its field type and returns the value to store
 * (datetimes normalized to ISO, richtext sanitized). `undefined` = invalid.
 */
function coerceValue(type: ScalarFieldType, value: unknown): unknown {
  switch (type) {
    case 'string':
    case 'text':
      return typeof value === 'string' ? value : undefined;
    case 'richtext':
      return typeof value === 'string' ? sanitizeRichtext(value) : undefined;
    case 'integer':
      return Number.isInteger(value) && Math.abs(value as number) <= INT4_MAX
        ? value
        : undefined;
    case 'media':
      // The file's public `document_id`; the internal id never crosses the API.
      return isUuid(value) ? value.toLowerCase() : undefined;
    case 'decimal':
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
      }
      return typeof value === 'string' && DECIMAL_STRING.test(value)
        ? value
        : undefined;
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'date':
      return typeof value === 'string'
        ? coerceFilterValue('date', value)
        : undefined;
    case 'datetime':
      return typeof value === 'string'
        ? coerceFilterValue('datetime', value)
        : undefined;
    case 'json':
      return value;
  }
}

const at = (base: string, rest: string) =>
  base === '' ? rest : `${base}.${rest}`;

function invalid(path: string, message: string): BadRequestException {
  return new BadRequestException({
    errorCode: DOCUMENT_ERROR_CODES.INVALID,
    message: `${path} ${message}`,
  });
}

function validateValues(
  table: TableNode,
  values: FieldValues | undefined,
  fieldPrefix: string,
  inputPath: string,
  isNew: boolean,
  options: TreeValidationOptions,
): FieldValues {
  const output: FieldValues = {};
  for (const [name, value] of Object.entries(values ?? {})) {
    const column = table.columnsByField.get(name);
    if (column === undefined) continue;
    const path = at(inputPath, `values.${name}`);
    if (value === null || value === undefined) {
      if (column.field.required === true) {
        throw invalid(path, DOCUMENT_ERROR_MESSAGES.REQUIRED);
      }
      output[name] = null;
      continue;
    }
    const coerced = coerceValue(column.field.type as ScalarFieldType, value);
    if (coerced === undefined) {
      throw invalid(path, DOCUMENT_ERROR_MESSAGES.INVALID_TYPE);
    }
    output[name] = coerced;
  }
  if (isNew) {
    for (const [name, column] of table.columnsByField) {
      if (
        column.field.required === true &&
        !(name in output) &&
        options.writable.allows(joinFieldPath(fieldPrefix, name))
      ) {
        throw invalid(
          at(inputPath, `values.${name}`),
          DOCUMENT_ERROR_MESSAGES.REQUIRED,
        );
      }
    }
  }
  return output;
}

function validateLevel(
  table: TableNode,
  input: ComponentInput,
  fieldPrefix: string,
  inputPath: string,
  isNew: boolean,
  options: TreeValidationOptions,
): ComponentInput {
  const output: ComponentInput = {};
  if (input.componentUid !== undefined)
    output.componentUid = input.componentUid;
  if (input.values !== undefined || isNew) {
    output.values = validateValues(
      table,
      input.values,
      fieldPrefix,
      inputPath,
      isNew,
      options,
    );
  }
  if (input.components !== undefined) {
    output.components = {};
    for (const [name, items] of Object.entries(input.components)) {
      const child = table.components.find(
        (component) => component.field.name === name,
      );
      if (child === undefined) continue;
      const path = joinFieldPath(fieldPrefix, name);
      const listPath = at(inputPath, `components.${name}`);
      if (child.field.required === true && items.length === 0) {
        throw invalid(listPath, DOCUMENT_ERROR_MESSAGES.REQUIRED);
      }
      output.components[name] = items.map((item, index) =>
        validateLevel(
          child.table,
          item,
          path,
          `${listPath}[${index}]`,
          item.componentUid === undefined,
          options,
        ),
      );
    }
  }
  if (isNew) {
    for (const child of table.components) {
      const path = joinFieldPath(fieldPrefix, child.field.name);
      if (
        child.field.required === true &&
        output.components?.[child.field.name] === undefined &&
        options.writable.allows(path)
      ) {
        throw invalid(
          at(inputPath, `components.${child.field.name}`),
          DOCUMENT_ERROR_MESSAGES.REQUIRED,
        );
      }
    }
  }
  return output;
}

/**
 * Value rules of a write (SPEC §8: `required` is enforced here, the columns
 * are nullable). Runs on the tree the `WriteAllowlist` produced:
 * - every sent value must match its field type (400 `DOCUMENT_INVALID`);
 * - a `required` field cannot be set to null; on create, and for new
 *   component items, a required field the actor may write must be sent;
 * - richtext goes through `sanitizeRichtext`; datetimes are normalized.
 * Messages carry the input path only, never the value.
 * Tree shape (unknown keys, uids) was checked by `assertTreeInput`.
 */
export function validateTreeValues(
  root: TableNode,
  tree: TreeInput,
  options: TreeValidationOptions,
): TreeInput {
  const output = validateLevel(
    root,
    tree,
    '',
    '',
    options.mode === 'create',
    options,
  );
  return {
    ...(output.values === undefined ? {} : { values: output.values }),
    ...(output.components === undefined
      ? {}
      : { components: output.components }),
  };
}
