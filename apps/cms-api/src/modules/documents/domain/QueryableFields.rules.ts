import type { ConditionValueKind } from '../../access';
import { fieldTypeOf, type FieldDefinition } from '../../content-engine';

/**
 * What a top-level content field compares and sorts as in a document list
 * query; `undefined` = the field cannot be filtered or sorted. The registry's
 * `listQueryable` decides: components, `json` and `media` (its column holds
 * the internal file id, which never crosses the API) are not queryable.
 * One rule for REST (`queryColumnOf`) and the GraphQL schema builder.
 */
export function queryKindOfField(
  field: FieldDefinition,
): ConditionValueKind | undefined {
  const spec = fieldTypeOf(field.type);
  if (spec === undefined || !spec.listQueryable) return undefined;
  return spec.conditionKind ?? undefined;
}
