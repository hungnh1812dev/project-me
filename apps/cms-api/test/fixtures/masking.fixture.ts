import {
  type ActorContext,
  type ActorKind,
  accountActor,
  anonymousActor,
  apiTokenActor,
  reviewerActor,
} from '../../src/modules/access/actor-context';
import type { FieldSelection } from '../../src/modules/access/policy-evaluator';
import {
  type RecordReadAccess,
  recordReadAccess,
} from '../../src/modules/access/record-read-access';
import type { ContentDocument } from '../../src/modules/content-engine/content.repository';
import type { FieldDefinition } from '../../src/modules/content-engine/definition.schema';
import {
  type RegisteredContentType,
  RegistryService,
  type TableNode,
} from '../../src/modules/content-engine/registry.service';
import type {
  ComponentNode,
  ComponentTrees,
} from '../../src/modules/content-engine/tree-loader';
import type { FieldValues } from '../../src/modules/content-engine/tree-input';
import { systemRole } from './access.fixture';

/**
 * Every field type, a single component and two levels of repeatable
 * components: the shapes masking has to walk.
 */
export const PROFILE_DEFINITION = {
  slug: 'profile',
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    { name: 'name', type: 'string' },
    { name: 'summary', type: 'text' },
    { name: 'bio', type: 'richtext' },
    { name: 'salary', type: 'decimal' },
    { name: 'age', type: 'integer' },
    { name: 'active', type: 'boolean' },
    { name: 'born', type: 'date' },
    { name: 'seenAt', type: 'datetime' },
    { name: 'meta', type: 'json' },
    { name: 'avatar', type: 'media' },
    {
      name: 'contact',
      type: 'component',
      fields: [
        { name: 'email', type: 'string' },
        { name: 'phone', type: 'string' },
      ],
    },
    {
      name: 'experience',
      type: 'component',
      repeatable: true,
      fields: [
        { name: 'company', type: 'string' },
        { name: 'years', type: 'integer' },
        {
          name: 'roles',
          type: 'component',
          repeatable: true,
          fields: [
            { name: 'title', type: 'string' },
            { name: 'budget', type: 'decimal' },
            { name: 'remote', type: 'boolean' },
          ],
        },
      ],
    },
  ],
} as const;

export function profileType(): RegisteredContentType {
  return RegistryService.fromDefinitions([PROFILE_DEFINITION]).resolve(
    PROFILE_DEFINITION.slug,
  );
}

const RAW_NUMBER_BASE = 900_000_000;

/** Account ids of the raw record: distinctive, so a leak is found in JSON. */
export const RAW_ACCOUNT_IDS = {
  createdBy: 800_000_001,
  updatedBy: 800_000_002,
} as const;

/**
 * Builds a record whose every field holds a value unique to it (strings and
 * numbers can be searched for in serialized JSON). `raw` maps each field
 * path to the raw values it holds, across all items.
 */
export function rawRecord(
  type: RegisteredContentType,
  itemsPerList = 2,
): { record: ContentDocument; raw: Map<string, unknown[]> } {
  const raw = new Map<string, unknown[]>();
  let counter = 0;
  const next = () => (counter += 1);

  const rawValue = (field: FieldDefinition, path: string): unknown => {
    const n = next();
    switch (field.type) {
      case 'integer':
      case 'media':
        return RAW_NUMBER_BASE + n;
      case 'decimal':
        return `${RAW_NUMBER_BASE + n}.25`;
      case 'boolean':
        return n % 2 === 0;
      case 'json':
        return { secret: `RAW-${path}-${n}` };
      default:
        return `RAW-${path}-${n}`;
    }
  };

  const build = (
    table: TableNode,
    prefix: string,
  ): { values: FieldValues; components: ComponentTrees } => {
    const values: FieldValues = {};
    for (const { field } of table.plan.columns) {
      const path = prefix === '' ? field.name : `${prefix}.${field.name}`;
      const value = rawValue(field, path);
      values[field.name] = value;
      raw.set(path, [...(raw.get(path) ?? []), value]);
    }
    const components: ComponentTrees = {};
    for (const { field, table: child } of table.components) {
      const path = prefix === '' ? field.name : `${prefix}.${field.name}`;
      const count = field.repeatable ? itemsPerList : 1;
      components[field.name] = Array.from(
        { length: count },
        (_, index): ComponentNode => ({
          id: next(),
          componentUid: `00000000-0000-4000-8000-${String(next()).padStart(12, '0')}`,
          orderIndex: index,
          ...build(child, path),
        }),
      );
    }
    return { values, components };
  };

  const tree = build(type.root, '');
  const record: ContentDocument = {
    id: 1,
    documentId: '00000000-0000-4000-8000-000000000000',
    version: 3,
    publishedAt: null,
    locale: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    createdBy: RAW_ACCOUNT_IDS.createdBy,
    updatedBy: RAW_ACCOUNT_IDS.updatedBy,
    ...tree,
  };
  return { record, raw };
}

/** Deterministic PRNG (mulberry32) so property-style tests are reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** One actor of each kind, for building a RecordReadAccess per kind. */
export const ACTORS_BY_KIND: Record<ActorKind, ActorContext> = {
  account: accountActor(1, systemRole('editor')),
  api_token: apiTokenActor(1, 1, systemRole('editor'), { permissions: [] }),
  reviewer: reviewerActor(2, 1, systemRole('reviewer')),
  anonymous: anonymousActor(systemRole('public')),
};

/** Read access of a signed-in account (sees every system field). */
export function accountAccess(fields: FieldSelection): RecordReadAccess {
  return recordReadAccess(ACTORS_BY_KIND.account, fields);
}
