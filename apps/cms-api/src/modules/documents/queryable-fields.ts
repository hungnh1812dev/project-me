import { conditionKindOf, type ConditionValueKind } from '../access';
import { COMPONENT_FIELD_TYPE } from '../content-engine';
import type { FieldDefinition } from '../content-engine';

/**
 * What a top-level content field compares and sorts as in a document list
 * query; `undefined` = the field cannot be filtered or sorted. Components,
 * nested paths and `json` (no equality or order) are not queryable, and
 * neither is `media`: its column holds the internal file id, which never
 * crosses the API (T29).
 * One rule for REST (`queryColumnOf`) and the GraphQL schema builder.
 */
export function queryKindOfField(
  field: FieldDefinition,
): ConditionValueKind | undefined {
  if (field.type === COMPONENT_FIELD_TYPE || field.type === 'media') {
    return undefined;
  }
  return conditionKindOf(field.type);
}
