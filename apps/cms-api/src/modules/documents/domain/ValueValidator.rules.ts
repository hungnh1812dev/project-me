import { DomainError } from '../../../common/errors/Domain.errors';
import { joinFieldPath, type FieldSelection } from '../../access';
import {
  type ComponentInput,
  fieldTypeOf,
  type FieldValues,
  type TableNode,
  type TreeInput,
} from '../../content-engine';
import {
  DOCUMENT_ERROR_CODES,
  DOCUMENT_ERROR_MESSAGES,
} from './Documents.constants';

export type WriteMode = 'create' | 'update';

export interface TreeValidationOptions {
  mode: WriteMode;
  /** Fields the actor may write: a missing required field only counts when the actor could have sent it. */
  writable: FieldSelection;
}

const at = (base: string, rest: string) =>
  base === '' ? rest : `${base}.${rest}`;

function invalid(path: string, message: string): DomainError {
  return new DomainError({
    kind: 'invalid_input',
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
    // A type with no registry entry (a component) never reaches a value column.
    const coerced = fieldTypeOf(column.field.type)?.coerceValue(value);
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
 * - each value is coerced by its field type's registry rule (richtext is
 *   sanitized, datetimes normalized).
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
