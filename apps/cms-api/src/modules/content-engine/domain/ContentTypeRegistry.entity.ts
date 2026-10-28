import { CONTENT_ERROR_CODES } from './ContentEngine.constants';
import {
  type ComponentFieldDefinition,
  type ContentTypeDefinition,
  isComponentField,
} from './DefinitionSchema.rules';
import { validateDefinitions } from './DefinitionValidator.rules';
import { ContentEngineError } from './ContentDocument.entity';
import {
  type ColumnPlan,
  componentTableName,
  type TablePlan,
} from './Naming.rules';

/**
 * One table of a content type with what the repository needs to walk it:
 * its plan (all SQL names) and its component fields in definition order.
 */
export interface TableNode {
  plan: TablePlan;
  /** API field name -> column plan (scalar fields only). */
  columnsByField: ReadonlyMap<string, ColumnPlan>;
  components: readonly ComponentTableNode[];
}

export interface ComponentTableNode {
  field: ComponentFieldDefinition;
  table: TableNode;
}

export interface RegisteredContentType {
  slug: string;
  definition: ContentTypeDefinition;
  /** Every table, root first (same order as `planTables()`). */
  tables: readonly TablePlan[];
  root: TableNode;
}

export class UnknownContentTypeError extends ContentEngineError {
  readonly code = CONTENT_ERROR_CODES.CONTENT_TYPE_UNKNOWN;

  constructor(readonly slug: string) {
    super(`Unknown content type "${slug}".`);
    this.name = 'UnknownContentTypeError';
  }
}

function buildTableNode(
  plan: TablePlan,
  fields: ContentTypeDefinition['fields'],
  plansByName: ReadonlyMap<string, TablePlan>,
): TableNode {
  const components = fields.filter(isComponentField).map((field) => {
    const childName = componentTableName(plan.name, field.name);
    const childPlan = plansByName.get(childName);
    if (childPlan === undefined) {
      throw new ContentEngineError(
        `Table plan for component "${field.name}" of ${plan.name} is missing.`,
      );
    }
    return {
      field,
      table: buildTableNode(childPlan, field.fields, plansByName),
    };
  });
  return {
    plan,
    columnsByField: new Map(
      plan.columns.map((column) => [column.field.name, column]),
    ),
    components,
  };
}

function register(
  definition: ContentTypeDefinition,
  tables: TablePlan[],
): RegisteredContentType {
  const [rootPlan] = tables;
  if (rootPlan === undefined) {
    throw new ContentEngineError(`No tables planned for "${definition.slug}".`);
  }
  const plansByName = new Map(tables.map((plan) => [plan.name, plan]));
  return {
    slug: definition.slug,
    definition,
    tables,
    root: buildTableNode(rootPlan, definition.fields, plansByName),
  };
}

/**
 * The registered content types and their table plans. Every SQL name the
 * repository uses comes from here (via `planTables()`), never from input:
 * a request slug is only ever a lookup key.
 */
export class ContentTypeRegistry {
  private constructor(
    private readonly types: ReadonlyMap<string, RegisteredContentType>,
  ) {}

  /** Validates the definitions (alone and as a set) and plans their tables. */
  static fromDefinitions(definitions: readonly unknown[]): ContentTypeRegistry {
    const validation = validateDefinitions(definitions);
    if (!validation.ok) {
      throw new ContentEngineError(
        'Content type registry contains an invalid definition.',
      );
    }
    return new ContentTypeRegistry(
      new Map(
        validation.definitions.map(({ definition, tables }) => [
          definition.slug,
          register(definition, tables),
        ]),
      ),
    );
  }

  slugs(): string[] {
    return [...this.types.keys()];
  }

  /** @throws UnknownContentTypeError when the slug is not registered. */
  resolve(slug: string): RegisteredContentType {
    const type = this.types.get(slug);
    if (type === undefined) throw new UnknownContentTypeError(slug);
    return type;
  }
}
