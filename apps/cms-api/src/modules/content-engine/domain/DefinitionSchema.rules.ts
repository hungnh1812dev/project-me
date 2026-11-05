import { z } from 'zod';

import {
  COMPONENT_FIELD_TYPE,
  CONTENT_TYPE_KINDS,
  FIELD_WIDTHS,
  SCALAR_FIELD_TYPES,
} from './ContentEngine.constants';

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
}

export interface ComponentFieldDefinition extends BaseFieldDefinition {
  type: typeof COMPONENT_FIELD_TYPE;
  /** Names the component table (snake_case of this value); `name` stays the API key. */
  component: string;
  repeatable?: boolean | undefined;
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

const scalarFieldSchema = z.strictObject({
  ...baseFieldShape,
  type: z.enum(SCALAR_FIELD_TYPES),
  width: z.enum(FIELD_WIDTHS).optional(),
});

const componentFieldSchema = z.strictObject({
  ...baseFieldShape,
  type: z.literal(COMPONENT_FIELD_TYPE),
  component: z.string(),
  repeatable: z.boolean().optional(),
  get fields(): z.ZodType<FieldDefinition[]> {
    return fieldListSchema;
  },
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
