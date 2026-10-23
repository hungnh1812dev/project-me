import {
  CONDITION_SYSTEM_FIELDS,
  type RecordSystemField,
  type ConditionValueKind,
  joinFieldPath,
  type FieldSelection,
  type SubjectCatalog,
} from '../access';
import {
  type ContentTypeKind,
  type FieldDefinition,
  isComponentField,
} from '../content-engine/definition.schema';
import type { RegisteredContentType } from '../content-engine/registry.service';

type SystemConditionField = keyof typeof CONDITION_SYSTEM_FIELDS;

/** A content field of a type, at any depth (T17b). */
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

const SYSTEM_CONDITION_FIELDS = Object.keys(
  CONDITION_SYSTEM_FIELDS,
) as SystemConditionField[];

/**
 * Describes a registered type with the fields `visible` allows. Paths come
 * from the definition through the T16 helpers; condition kinds come from the
 * catalog (the content engine's table plan), so no naming rule is repeated.
 */
export function contentTypeView(
  type: RegisteredContentType,
  catalog: SubjectCatalog,
  visible: FieldVisibility,
): ContentTypeView {
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

  for (const name of SYSTEM_CONDITION_FIELDS) {
    if (!visible.systemFields.has(name)) continue;
    const { kind } = CONDITION_SYSTEM_FIELDS[name];
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
