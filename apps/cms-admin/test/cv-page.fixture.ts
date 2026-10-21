import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  ContentType,
  ContentTypeField,
} from '../src/features/access/access.api';

interface Definition {
  name: string;
  type: string;
  repeatable?: boolean;
  fields?: Definition[];
}

/** The real cv-page definition of cms-api, so tests follow the schema. */
const definition = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../cms-api/content/schemas/cv-page.json'),
    'utf8',
  ),
) as {
  slug: string;
  kind: string;
  draftAndPublish: boolean;
  fields: Definition[];
};

/** Flat path list like `GET /content-types/:slug`: depth-first, parents first. */
function flatten(fields: Definition[], prefix: string): ContentTypeField[] {
  return fields.flatMap((field) => {
    const path = prefix === '' ? field.name : `${prefix}.${field.name}`;
    const isComponent = field.type === 'component';
    const entry: ContentTypeField = {
      path,
      type: field.type,
      system: false,
      component: isComponent,
      repeatable: isComponent && field.repeatable === true,
      rootScalar: prefix === '' && !isComponent,
      conditionKind: null,
      sensitive: false,
    };
    return [entry, ...flatten(field.fields ?? [], path)];
  });
}

export const CV_PAGE_TYPE: ContentType = {
  slug: definition.slug,
  kind: definition.kind,
  draftAndPublish: definition.draftAndPublish,
  fields: flatten(definition.fields, ''),
};
