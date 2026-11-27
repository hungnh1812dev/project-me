import { z } from 'zod';

import {
  COMPONENT_FIELD_TYPE,
  CONTENT_TYPE_KINDS,
  FIELD_WIDTHS,
  MAX_ENUM_OPTION_LENGTH,
  MAX_ENUM_OPTIONS,
  RICHTEXT_FIELD_TYPE,
  SCALAR_FIELD_TYPES,
} from './ContentEngine.constants';
import { fieldTypeOf } from './field-types';

/**
 * Shape of a content type definition (`content/schemas/<slug>.json`).
 * Naming, depth and length rules are not expressed here; they live in
 * `definition.validator.ts` so each failure carries its own rule code.
 * Format reference: docs/modules/content-schema.md.
 */

export type ContentTypeKind = (typeof CONTENT_TYPE_KINDS)[number];
export type ScalarFieldType = (typeof SCALAR_FIELD_TYPES)[number];
export type FieldWidth = (typeof FIELD_WIDTHS)[number];

interface BaseFieldDefinition {
  /** API property name; the column/table segment is its snake_case form. */
  name: string;
  required?: boolean | undefined;
  /** Hint: masked for low-privilege roles by default (SPEC D2, §6). */
  sensitive?: boolean | undefined;
  /** Admin label; the admin derives one from `name` when absent. Same rules as the content type's. */
  displayName?: string | undefined;
}

export interface ScalarFieldDefinition extends BaseFieldDefinition {
  type: ScalarFieldType;
  /** Share of the admin form row; the content types API reports `full` when absent. */
  width?: FieldWidth | undefined;
  /** `integer` only: the API refuses a negative value. */
  unsigned?: boolean | undefined;
  /** `enumeration` only (required there): the allowed values, in display order. */
  options?: string[] | undefined;
  /** Fixed value cms-admin puts in a new document; checked as an API write of this field (CM-11). */
  default?: unknown;
}

export interface ComponentFieldDefinition extends BaseFieldDefinition {
  type: typeof COMPONENT_FIELD_TYPE;
  /** Names the component table (snake_case of this value); `name` stays the API key. */
  component: string;
  repeatable?: boolean | undefined;
  /** `repeatable` only: `name` of the direct child whose value heads a collapsed item (CM-14). */
  titleField?: string | undefined;
  /** Needs `titleField`; a different child, shown beside the title (CM-14). */
  subtitleField?: string | undefined;
  fields: FieldDefinition[];
}

export type FieldDefinition = ScalarFieldDefinition | ComponentFieldDefinition;

export interface ContentTypeDefinition {
  slug: string;
  /** Label shown in the admin UI; rules in `DefinitionValidator.rules.ts`. */
  displayName: string;
  kind: ContentTypeKind;
  draftAndPublish: boolean;
  fields: FieldDefinition[];
}

const baseFieldShape = {
  name: z.string().min(1),
  required: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  displayName: z.string().optional(),
};

const ENUMERATION_TYPE = 'enumeration';
const UNSIGNED_TYPE = 'integer';

const optionSchema = z
  .string()
  .refine((option) => option !== '' && option === option.trim(), {
    message: 'An option must be a non-blank string without leading or trailing whitespace.',
  })
  .refine((option) => [...option].length <= MAX_ENUM_OPTION_LENGTH, {
    message: `An option may have at most ${MAX_ENUM_OPTION_LENGTH} characters.`,
  });

const optionsSchema = z
  .array(optionSchema)
  .min(1)
  .max(MAX_ENUM_OPTIONS)
  .refine((options) => new Set(options).size === options.length, {
    message: 'Options must be unique.',
  });

/** The `default` of a scalar field in the API's value form; `undefined` when unset or not a valid value. */
export function normalizedDefaultOf(field: FieldDefinition): unknown {
  if (isComponentField(field) || field.default === undefined || field.default === null) {
    return undefined;
  }
  return fieldTypeOf(field.type)?.coerceValue(field.default, {
    field: { unsigned: field.unsigned, options: field.options },
  });
}

function defaultIssueOf(field: ScalarFieldDefinition): string | undefined {
  if (field.default === undefined) return undefined;
  if (!fieldTypeOf(field.type)?.acceptsDefault) {
    return `A ${field.type} field cannot have a "default".`;
  }
  if (field.default === null) return 'The "default" cannot be null.';
  const isOptionListMissing = field.type === ENUMERATION_TYPE && field.options === undefined;
  if (isOptionListMissing) return undefined;
  const normalized = normalizedDefaultOf(field);
  if (normalized === undefined) {
    return `The "default" is not a value a ${field.type} field accepts.`;
  }
  if (field.type === RICHTEXT_FIELD_TYPE && normalized !== field.default) {
    return 'The "default" is changed by the richtext sanitizer; it may hold no image or script.';
  }
  return undefined;
}

const scalarFieldSchema = z
  .strictObject({
    ...baseFieldShape,
    type: z.enum(SCALAR_FIELD_TYPES),
    width: z.enum(FIELD_WIDTHS).optional(),
    unsigned: z.boolean().optional(),
    options: optionsSchema.optional(),
    default: z.unknown().optional(),
  })
  .superRefine((field, context) => {
    if (field.unsigned !== undefined && field.type !== UNSIGNED_TYPE) {
      context.addIssue({
        code: 'custom',
        path: ['unsigned'],
        message: `"unsigned" is allowed only on ${UNSIGNED_TYPE} fields.`,
      });
    }
    if (field.options !== undefined && field.type !== ENUMERATION_TYPE) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: `"options" is allowed only on ${ENUMERATION_TYPE} fields.`,
      });
    }
    if (field.options === undefined && field.type === ENUMERATION_TYPE) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: `An ${ENUMERATION_TYPE} field needs "options".`,
      });
    }
    const defaultIssue = defaultIssueOf(field);
    if (defaultIssue !== undefined) {
      context.addIssue({ code: 'custom', path: ['default'], message: defaultIssue });
    }
  });

const ITEM_TITLE_KEYS = ['titleField', 'subtitleField'] as const;
type ItemTitleKey = (typeof ITEM_TITLE_KEYS)[number];

/** Why a `titleField` / `subtitleField` of a component is refused (CM-14); names the key and the child, never a value. */
function itemTitleIssueOf(
  field: Pick<ComponentFieldDefinition, ItemTitleKey | 'repeatable' | 'fields'>,
  key: ItemTitleKey,
): string | undefined {
  const childName = field[key];
  if (childName === undefined) return undefined;
  if (field.repeatable !== true) return `"${key}" is allowed only on a repeatable component.`;
  const child = field.fields.find((candidate) => candidate.name === childName);
  if (child === undefined) return `"${key}" must name a direct child field of the component.`;
  if (!isTitleType(child)) {
    return `"${key}" names the child "${child.name}", whose ${child.type} type has no one-line text form.`;
  }
  if (key === 'subtitleField') {
    if (field.titleField === undefined) return `"${key}" needs a "titleField".`;
    if (field.titleField === childName)
      return `"${key}" must name a different child than "titleField".`;
  }
  return undefined;
}

function isTitleType(field: FieldDefinition): boolean {
  return fieldTypeOf(field.type)?.canTitleItem === true;
}

const componentFieldSchema = z
  .strictObject({
    ...baseFieldShape,
    type: z.literal(COMPONENT_FIELD_TYPE),
    component: z.string(),
    repeatable: z.boolean().optional(),
    titleField: z.string().optional(),
    subtitleField: z.string().optional(),
    // Declared only to refuse it with a message of its own (CM-11).
    default: z.unknown().optional(),
    get fields(): z.ZodType<FieldDefinition[]> {
      return fieldListSchema;
    },
  })
  .superRefine((field, context) => {
    if (field.default !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['default'],
        message: `A ${COMPONENT_FIELD_TYPE} field cannot have a "default".`,
      });
    }
    for (const key of ITEM_TITLE_KEYS) {
      const message = itemTitleIssueOf(field, key);
      if (message !== undefined) context.addIssue({ code: 'custom', path: [key], message });
    }
  });

const fieldSchema: z.ZodType<FieldDefinition> = z.discriminatedUnion('type', [
  scalarFieldSchema,
  componentFieldSchema,
]);

const fieldListSchema: z.ZodType<FieldDefinition[]> = z.array(fieldSchema).min(1);

export const contentTypeDefinitionSchema: z.ZodType<ContentTypeDefinition> = z.strictObject({
  slug: z.string().min(1),
  displayName: z.string(),
  kind: z.enum(CONTENT_TYPE_KINDS),
  draftAndPublish: z.boolean(),
  fields: fieldListSchema,
});

export function isComponentField(field: FieldDefinition): field is ComponentFieldDefinition {
  return field.type === COMPONENT_FIELD_TYPE;
}
