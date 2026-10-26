import type {
  RegisteredContentType,
  ContentTypeRegistry,
} from '../../content-engine';
import {
  CONTENT_WILDCARD_SUBJECT,
  type PermissionAction,
  PERMISSION_ACTIONS,
  SYSTEM_SUBJECT_ACTIONS,
  type SystemSubject,
} from './Access.constants';
import {
  type ConditionField,
  type ConditionFieldCatalog,
  conditionKindOf,
  systemConditionField,
} from './Conditions.rules';
import {
  fieldPathsOf,
  type FieldList,
  fieldListAllows,
} from './FieldPaths.rules';

/**
 * The subjects permissions can name: `*`, the registered content types and
 * the system subjects. Anything else is unknown, and unknown is denied.
 */
export class SubjectCatalog {
  private readonly content: ReadonlyMap<string, RegisteredContentType>;
  private readonly paths: ReadonlyMap<string, ReadonlySet<string>>;

  constructor(registry: ContentTypeRegistry) {
    this.content = new Map(
      registry.slugs().map((slug) => [slug, registry.resolve(slug)]),
    );
    this.paths = new Map(
      [...this.content].map(([slug, type]) => [
        slug,
        fieldPathsOf(type.definition),
      ]),
    );
  }

  isSystemSubject(subject: string): subject is SystemSubject {
    return Object.hasOwn(SYSTEM_SUBJECT_ACTIONS, subject);
  }

  isContentType(subject: string): boolean {
    return this.content.has(subject);
  }

  /** `*` or a registered content type: what content permissions and token scopes may name. */
  isContentSubject(subject: string): boolean {
    return subject === CONTENT_WILDCARD_SUBJECT || this.isContentType(subject);
  }

  /** A concrete subject a request can target (never `*`). */
  isKnownSubject(subject: string): boolean {
    return this.isContentType(subject) || this.isSystemSubject(subject);
  }

  /** Actions valid on a permission subject (empty for unknown subjects). */
  actionsFor(subject: string): readonly PermissionAction[] {
    if (this.isSystemSubject(subject)) return SYSTEM_SUBJECT_ACTIONS[subject];
    return this.isContentSubject(subject) ? PERMISSION_ACTIONS : [];
  }

  /** Slugs of every registered content type (never `*`). */
  contentTypeSlugs(): string[] {
    return [...this.content.keys()];
  }

  contentType(slug: string): RegisteredContentType | undefined {
    return this.content.get(slug);
  }

  /** Every field path of a content type (see field-paths.ts). */
  fieldPaths(slug: string): ReadonlySet<string> | undefined {
    return this.paths.get(slug);
  }

  /**
   * Fields a condition on `subject` may compare: the system fields, plus
   * for a content type its root scalar fields that `readable` allows,
   * mapped to columns by the content engine's table plan.
   */
  conditionFields(subject: string, readable: FieldList): ConditionFieldCatalog {
    const root = this.content.get(subject)?.root;
    return (field: string): ConditionField | undefined => {
      const system = systemConditionField(field);
      if (system !== undefined) return system;
      const column = root?.columnsByField.get(field);
      if (column === undefined || !fieldListAllows(readable, field)) {
        return undefined;
      }
      if (column.field.type === 'component') return undefined;
      const kind = conditionKindOf(column.field.type);
      return kind === undefined ? undefined : { column: column.name, kind };
    };
  }
}
