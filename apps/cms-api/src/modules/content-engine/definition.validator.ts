import {
  DEFINITION_RULES,
  ENGINE_RESERVED_NAMES,
  MAX_COMPONENT_DEPTH,
  MAX_IDENTIFIER_BYTES,
  SLUG_PATTERN,
  SQL_IDENTIFIER_PATTERN,
  SQL_RESERVED_WORDS,
  TABLE_PATH_SEPARATOR,
} from './content-engine.constants';
import {
  type ContentTypeDefinition,
  contentTypeDefinitionSchema,
  type FieldDefinition,
  isComponentField,
} from './definition.schema';
import {
  identifierBytes,
  planTables,
  rootTableName,
  type TablePlan,
  toSqlIdentifier,
} from './naming';

export type DefinitionRule =
  (typeof DEFINITION_RULES)[keyof typeof DEFINITION_RULES];

export type DefinitionPath = (string | number)[];

/** One problem in a definition, shaped for the admin UI and the CLI. */
export interface DefinitionValidationError {
  /** JSON path inside the definition (prefixed with the list index in `validateDefinitions`). */
  path: DefinitionPath;
  rule: DefinitionRule;
  message: string;
}

export type DefinitionValidationResult =
  | { ok: true; definition: ContentTypeDefinition; tables: TablePlan[] }
  | { ok: false; errors: DefinitionValidationError[] };

export type DefinitionSetValidationResult =
  | {
      ok: true;
      definitions: { definition: ContentTypeDefinition; tables: TablePlan[] }[];
    }
  | { ok: false; errors: DefinitionValidationError[] };

const SQL_RESERVED = new Set<string>(SQL_RESERVED_WORDS);
const ENGINE_RESERVED = new Set<string>(ENGINE_RESERVED_NAMES);

/** `['fields', 2, 'name']` -> `fields[2].name`. */
export function formatDefinitionPath(path: DefinitionPath): string {
  return path.reduce<string>((text, segment) => {
    if (typeof segment === 'number') return `${text}[${segment}]`;
    return text === '' ? segment : `${text}.${segment}`;
  }, '');
}

function isWellFormedSqlIdentifier(identifier: string): boolean {
  return (
    SQL_IDENTIFIER_PATTERN.test(identifier) &&
    !identifier.includes(TABLE_PATH_SEPARATOR) &&
    !identifier.endsWith('_')
  );
}

function checkSlug(slug: string, errors: DefinitionValidationError[]): void {
  const path = ['slug'];
  if (!SLUG_PATTERN.test(slug)) {
    errors.push({
      path,
      rule: DEFINITION_RULES.IDENTIFIER_INVALID,
      message: `Slug "${slug}" must be lowercase kebab-case: a letter first, then letters, digits and single hyphens (e.g. "cv-page").`,
    });
    return;
  }
  const table = rootTableName(slug);
  if (SQL_RESERVED.has(table)) {
    errors.push({
      path,
      rule: DEFINITION_RULES.IDENTIFIER_RESERVED,
      message: `Slug "${slug}" maps to "${table}", a reserved SQL word. Choose another slug.`,
    });
  }
}

function checkFields(
  fields: FieldDefinition[],
  depth: number,
  path: DefinitionPath,
  errors: DefinitionValidationError[],
): void {
  const seen = new Map<string, string>();

  fields.forEach((field, index) => {
    const fieldPath = [...path, 'fields', index];
    const namePath = [...fieldPath, 'name'];
    const identifier = toSqlIdentifier(field.name);

    if (!isWellFormedSqlIdentifier(identifier)) {
      errors.push({
        path: namePath,
        rule: DEFINITION_RULES.IDENTIFIER_INVALID,
        message: `Field name "${field.name}" maps to "${identifier}", which must match ${SQL_IDENTIFIER_PATTERN.source} without "__" or a trailing "_". Start with a lowercase letter and use only letters, digits and single underscores.`,
      });
    } else if (ENGINE_RESERVED.has(identifier)) {
      errors.push({
        path: namePath,
        rule: DEFINITION_RULES.IDENTIFIER_RESERVED,
        message: `Field name "${field.name}" maps to "${identifier}", a column the content engine owns. Rename the field.`,
      });
    } else if (SQL_RESERVED.has(identifier)) {
      errors.push({
        path: namePath,
        rule: DEFINITION_RULES.IDENTIFIER_RESERVED,
        message: `Field name "${field.name}" maps to "${identifier}", a reserved SQL word. Rename the field.`,
      });
    }

    const clash = seen.get(identifier);
    if (clash === undefined) {
      seen.set(identifier, field.name);
    } else {
      errors.push({
        path: namePath,
        rule: DEFINITION_RULES.IDENTIFIER_COLLISION,
        message: `Field name "${field.name}" and "${clash}" both map to "${identifier}" at this level. Rename one of them.`,
      });
    }

    if (isComponentField(field)) {
      const childDepth = depth + 1;
      if (childDepth > MAX_COMPONENT_DEPTH) {
        errors.push({
          path: fieldPath,
          rule: DEFINITION_RULES.COMPONENT_DEPTH_EXCEEDED,
          message: `Component "${field.name}" is at depth ${childDepth}; components may nest at most ${MAX_COMPONENT_DEPTH} levels below the root.`,
        });
        return;
      }
      checkFields(field.fields, childDepth, fieldPath, errors);
    }
  });
}

function tooLong(
  name: string,
  path: DefinitionPath,
  what: string,
): DefinitionValidationError {
  return {
    path,
    rule: DEFINITION_RULES.IDENTIFIER_TOO_LONG,
    message: `${what} "${name}" is ${identifierBytes(name)} bytes; Postgres allows ${MAX_IDENTIFIER_BYTES}. Shorten the slug or field names on this path.`,
  };
}

function checkLengths(
  tables: TablePlan[],
  errors: DefinitionValidationError[],
): void {
  for (const table of tables) {
    if (identifierBytes(table.name) > MAX_IDENTIFIER_BYTES) {
      // Every relation name starts with the table name; one error is enough.
      errors.push(tooLong(table.name, table.namePath, 'Table name'));
      continue;
    }
    for (const relation of table.relationNames) {
      if (identifierBytes(relation.name) > MAX_IDENTIFIER_BYTES) {
        errors.push(
          tooLong(relation.name, relation.namePath, 'Index or constraint name'),
        );
      }
    }
    for (const column of table.columns) {
      if (identifierBytes(column.name) > MAX_IDENTIFIER_BYTES) {
        errors.push(
          tooLong(column.name, [...column.path, 'name'], 'Column name'),
        );
      }
    }
  }
}

interface OwnedName {
  name: string;
  path: DefinitionPath;
}

/** Table, index and constraint names share one namespace in the content schema. */
function schemaNames(tables: TablePlan[]): OwnedName[] {
  return tables.flatMap((table) => [
    { name: table.name, path: table.namePath },
    ...table.relationNames.map((relation) => ({
      name: relation.name,
      path: relation.namePath,
    })),
  ]);
}

function checkSchemaCollisions(
  names: OwnedName[],
  errors: DefinitionValidationError[],
): void {
  const owners = new Map<string, OwnedName>();
  for (const entry of names) {
    const owner = owners.get(entry.name);
    if (owner === undefined) {
      owners.set(entry.name, entry);
      continue;
    }
    errors.push({
      path: entry.path,
      rule: DEFINITION_RULES.IDENTIFIER_COLLISION,
      message: `Generated name "${entry.name}" is already used by ${formatDefinitionPath(owner.path)} in the "content" schema. Rename the slug or field.`,
    });
  }
}

/**
 * Validates one definition: shape, then naming, depth, length and collision
 * rules. Collects every error instead of stopping at the first.
 */
export function validateDefinition(input: unknown): DefinitionValidationResult {
  const parsed = contentTypeDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.filter(
          (segment): segment is string | number => typeof segment !== 'symbol',
        ),
        rule: DEFINITION_RULES.SCHEMA_INVALID,
        message: issue.message,
      })),
    };
  }

  const definition = parsed.data;
  const errors: DefinitionValidationError[] = [];
  checkSlug(definition.slug, errors);
  checkFields(definition.fields, 0, [], errors);

  // Composition only makes sense on well-formed, depth-limited names.
  if (errors.length > 0) return { ok: false, errors };

  const tables = planTables(definition);
  checkLengths(tables, errors);
  checkSchemaCollisions(schemaNames(tables), errors);

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, definition, tables };
}

/**
 * Validates every definition, then checks generated names across all of
 * them (they share the `content` schema). Error paths start with the
 * definition's index in `inputs`.
 */
export function validateDefinitions(
  inputs: readonly unknown[],
): DefinitionSetValidationResult {
  const errors: DefinitionValidationError[] = [];
  const valid: { definition: ContentTypeDefinition; tables: TablePlan[] }[] =
    [];
  const names: OwnedName[] = [];

  inputs.forEach((input, index) => {
    const validation = validateDefinition(input);
    if (!validation.ok) {
      errors.push(
        ...validation.errors.map((error) => ({
          ...error,
          path: [index, ...error.path],
        })),
      );
      return;
    }
    valid.push({ definition: validation.definition, tables: validation.tables });
    names.push(
      ...schemaNames(validation.tables).map((entry) => ({
        ...entry,
        path: [index, ...entry.path],
      })),
    );
  });

  checkSchemaCollisions(names, errors);

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, definitions: valid };
}
