import { DomainError } from '../../../common/errors/Domain.errors';
import type {
  CONDITION_SYSTEM_FIELDS,
  RecordSystemField,
  ConditionValueKind,
  FieldSelection,
  SubjectCatalog,
} from '../../access';
import type {
  ContentTypeKind,
  FieldDefinition,
  RegisteredContentType,
} from '../../content-engine';
import { isComponentField } from '../../content-engine';

type ConditionSystemFields = typeof CONDITION_SYSTEM_FIELDS;
type SystemConditionField = keyof ConditionSystemFields;

/** A content field of a type, at any depth. */
export interface ContentFieldView {
  /** API field path as permission field lists name it: `reference.phone`. */
  readonly path: string;
  readonly type: FieldDefinition['type'];
  readonly system: false;
  readonly component: boolean;
  /** Only components can be repeatable. */
  readonly repeatable: boolean;
  /** A scalar field at the root (not inside a component). */
  readonly rootScalar: boolean;
  /**
   * Value kind a condition compares this field with, or null when conditions
   * may not use it (components, nested fields, json). A role's condition may
   * use it only when the same permission set makes it readable.
   */
  readonly conditionKind: ConditionValueKind | null;
  /** Definition hint: masked for low-privilege roles by default. */
  readonly sensitive: boolean;
}

/** A root system field conditions may compare (`createdBy`, `updatedBy`, `documentId`). */
export interface SystemFieldView {
  readonly path: SystemConditionField;
  readonly type: ConditionValueKind;
  readonly system: true;
  readonly component: false;
  readonly repeatable: false;
  readonly rootScalar: true;
  readonly conditionKind: ConditionValueKind;
  readonly sensitive: false;
}

export type FieldView = ContentFieldView | SystemFieldView;

/** `GET /content-types` item and `GET /content-types/:slug` body. */
export interface ContentTypeView {
  readonly slug: string;
  readonly kind: ContentTypeKind;
  readonly draftAndPublish: boolean;
  /** Content fields depth-first in definition order, then the system fields. */
  readonly fields: readonly FieldView[];
}

/** Which fields of a type the caller may see. */
export interface FieldVisibility {
  /** Content fields: a path is shown when it or a field inside it is allowed. */
  readonly fields: FieldSelection;
  readonly systemFields: ReadonlySet<RecordSystemField>;
}

/**
 * What the view takes from the access module as values. The application
 * layer passes them in, because `domain/` may not import another module's
 * values (ADR 0006 §7.8).
 */
export interface ViewVocabulary {
  readonly systemConditionFields: ConditionSystemFields;
  readonly joinFieldPath: (prefix: string, name: string) => string;
}

/**
 * Describes a registered type with the fields `visible` allows. Paths come
 * from the definition through the definition helpers; condition kinds come from the
 * catalog (the content engine's table plan), so no naming rule is repeated.
 */
export function contentTypeView(
  type: RegisteredContentType,
  catalog: SubjectCatalog,
  visible: FieldVisibility,
  { systemConditionFields, joinFieldPath }: ViewVocabulary,
): ContentTypeView {
  const systemFieldNames = Object.keys(
    systemConditionFields,
  ) as SystemConditionField[];
  const conditionField = catalog.conditionFields(type.slug, null);
  const fields: FieldView[] = [];

  const visit = (definitions: readonly FieldDefinition[], prefix: string) => {
    for (const field of definitions) {
      const path = joinFieldPath(prefix, field.name);
      if (!visible.fields.reaches(path)) continue;
      const component = isComponentField(field);
      const rootScalar = prefix === '' && !component;
      fields.push({
        path,
        type: field.type,
        system: false,
        component,
        repeatable: component && field.repeatable === true,
        rootScalar,
        conditionKind: rootScalar
          ? (conditionField(field.name)?.kind ?? null)
          : null,
        sensitive: field.sensitive === true,
      });
      if (component) visit(field.fields, path);
    }
  };
  visit(type.definition.fields, '');

  for (const name of systemFieldNames) {
    if (!visible.systemFields.has(name)) continue;
    const { kind } = systemConditionFields[name];
    fields.push({
      path: name,
      type: kind,
      system: true,
      component: false,
      repeatable: false,
      rootScalar: true,
      conditionKind: kind,
      sensitive: false,
    });
  }

  return {
    slug: type.slug,
    kind: type.definition.kind,
    draftAndPublish: type.definition.draftAndPublish,
    fields,
  };
}

/** Error codes of the content types API. */
export const CONTENT_TYPES_ERROR_CODES = {
  /**
   * The slug is not registered, or the caller may not read it. Both answer
   * the same 404 so the API does not reveal which types exist.
   */
  NOT_FOUND: 'CONTENT_TYPE_NOT_FOUND',
} as const;

export const CONTENT_TYPES_ERROR_MESSAGES = {
  NOT_FOUND: 'Content type not found.',
} as const;

export function contentTypeNotFound(): DomainError {
  return new DomainError({
    kind: 'not_found',
    errorCode: CONTENT_TYPES_ERROR_CODES.NOT_FOUND,
    message: CONTENT_TYPES_ERROR_MESSAGES.NOT_FOUND,
  });
}
