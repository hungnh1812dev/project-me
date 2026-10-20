import { z } from 'zod';

import {
  COMPONENT_FIELD_TYPE,
  CONTENT_TYPE_KINDS,
  SCALAR_FIELD_TYPES,
} from './content-engine.constants';

/**
 * Shape of a content type definition (`content/schemas/<slug>.json`).
 * Naming, depth and length rules are not expressed here; they live in
 * `definition.validator.ts` so each failure carries its own rule code.
 * Format reference: docs/modules/content-schema.md.
 */

export type ContentTypeKind = (typeof CONTENT_TYPE_KINDS)[number];
export type ScalarFieldType = (typeof SCALAR_FIELD_TYPES)[number];

interface BaseFieldDefinition {
  /** API property name; the column/table segment is its snake_case form. */
  name: string;
  required?: boolean | undefined;
  /** Hint: masked for low-privilege roles by default (SPEC D2, §6). */
  sensitive?: boolean | undefined;
}

export interface ScalarFieldDefinition extends BaseFieldDefinition {
  type: ScalarFieldType;
}

export interface ComponentFieldDefinition extends BaseFieldDefinition {
  type: typeof COMPONENT_FIELD_TYPE;
  repeatable?: boolean | undefined;
  fields: FieldDefinition[];
}

export type FieldDefinition = ScalarFieldDefinition | ComponentFieldDefinition;

export interface ContentTypeDefinition {
  slug: string;
  kind: ContentTypeKind;
  draftAndPublish: boolean;
  fields: FieldDefinition[];
}

const baseFieldShape = {
  name: z.string().min(1),
  required: z.boolean().optional(),
  sensitive: z.boolean().optional(),
};

const scalarFieldSchema = z.strictObject({
  ...baseFieldShape,
  type: z.enum(SCALAR_FIELD_TYPES),
});

const componentFieldSchema = z.strictObject({
  ...baseFieldShape,
  type: z.literal(COMPONENT_FIELD_TYPE),
  repeatable: z.boolean().optional(),
  get fields(): z.ZodType<FieldDefinition[]> {
    return fieldListSchema;
  },
});

const fieldSchema: z.ZodType<FieldDefinition> = z.discriminatedUnion('type', [
  scalarFieldSchema,
  componentFieldSchema,
]);

const fieldListSchema: z.ZodType<FieldDefinition[]> = z
  .array(fieldSchema)
  .min(1);

export const contentTypeDefinitionSchema: z.ZodType<ContentTypeDefinition> =
  z.strictObject({
    slug: z.string().min(1),
    kind: z.enum(CONTENT_TYPE_KINDS),
    draftAndPublish: z.boolean(),
    fields: fieldListSchema,
  });

export function isComponentField(
  field: FieldDefinition,
): field is ComponentFieldDefinition {
  return field.type === COMPONENT_FIELD_TYPE;
}
