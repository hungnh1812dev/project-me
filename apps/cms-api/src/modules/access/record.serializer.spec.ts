import {
  accountAccess,
  ACTORS_BY_KIND,
  profileType,
  RAW_ACCOUNT_IDS,
  rawRecord,
  seededRandom,
} from '../../../test/fixtures/masking.fixture';
import type { ContentDocument } from '../content-engine/content.repository';
import type { TableNode } from '../content-engine/registry.service';
import {
  type ComponentTrees,
  rowToValues,
} from '../content-engine/tree-loader';
import {
  ACCOUNT_REFERENCE_FIELDS,
  ACCOUNT_REFERENCES_HIDDEN_FROM,
  MASK_SENTINEL,
  MASKED_FIELDS_KEY,
  RECORD_SYSTEM_FIELDS,
} from './access.constants';
import type { ActorKind } from './actor-context';
import { projectTable } from './field-projection';
import { fieldPathsOf } from './field-paths';
import { FieldSelection } from './policy-evaluator';
import { recordReadAccess } from './record-read-access';
import {
  maskedFieldPaths,
  RecordSerializer,
  type SerializedComponent,
  type SerializedRecord,
} from './record.serializer';

const type = profileType();
const serializer = new RecordSerializer(type);
const ALL_PATHS = [...fieldPathsOf(type.definition)];
const PROPERTY_RUNS = 300;
const PROPERTY_SEED = 16;

const only = (...paths: string[]) => FieldSelection.of(paths);

function items(out: SerializedRecord, name: string): SerializedComponent[] {
  const list = out.components[name];
  if (list === null || list === undefined) throw new Error(`${name} masked`);
  return list;
}

describe('RecordSerializer', () => {
  const { record } = rawRecord(type);

  it('returns every field and the system fields for ALL, no internal ids', () => {
    const out = serializer.serialize(record, accountAccess(FieldSelection.ALL));
    expect(out.values).toEqual(record.values);
    expect(out[MASKED_FIELDS_KEY]).toEqual([]);
    expect(out).toMatchObject({
      documentId: record.documentId,
      version: record.version,
      createdBy: record.createdBy,
    });
    expect(out).not.toHaveProperty('id');
    const [first] = items(out, 'experience');
    expect(first).not.toHaveProperty('id');
    expect(first).not.toHaveProperty('orderIndex');
    expect(first?.componentUid).toBe(
      record.components.experience?.[0]?.componentUid,
    );
  });

  it('masks text types with the sentinel and other types with null', () => {
    const out = serializer.serialize(
      record,
      accountAccess(FieldSelection.NONE),
    );
    expect(out.values).toEqual({
      name: MASK_SENTINEL,
      summary: MASK_SENTINEL,
      bio: MASK_SENTINEL,
      salary: null,
      age: null,
      active: null,
      born: null,
      seenAt: null,
      meta: null,
      avatar: null,
    });
    expect(out.components).toEqual({ contact: null, experience: null });
    expect(out[MASKED_FIELDS_KEY]).toEqual([
      'name',
      'summary',
      'bio',
      'salary',
      'age',
      'active',
      'born',
      'seenAt',
      'meta',
      'avatar',
      'contact',
      'experience',
    ]);
  });

  it('keeps system fields readable even with no readable field', () => {
    const out = serializer.serialize(
      record,
      accountAccess(FieldSelection.NONE),
    );
    expect(out.documentId).toBe(record.documentId);
    expect(out.updatedAt).toBe(record.updatedAt);
  });

  it('masks sub-fields of a partly readable component in every item', () => {
    const out = serializer.serialize(
      record,
      accountAccess(only('name', 'experience.years', 'experience.roles.title')),
    );
    const experience = items(out, 'experience');
    expect(experience).toHaveLength(2);
    for (const item of experience) {
      expect(item.values.company).toBe(MASK_SENTINEL);
      expect(typeof item.values.years).toBe('number');
      const roles = item.components.roles ?? [];
      expect(roles).toHaveLength(2);
      for (const role of roles) {
        expect(role.values.title).toMatch(/^RAW-/);
        expect(role.values.budget).toBeNull();
        expect(role.values.remote).toBeNull();
      }
    }
    expect(out[MASKED_FIELDS_KEY]).toEqual([
      'summary',
      'bio',
      'salary',
      'age',
      'active',
      'born',
      'seenAt',
      'meta',
      'avatar',
      'contact',
      'experience.company',
      'experience.roles.budget',
      'experience.roles.remote',
    ]);
  });

  it('a granted component covers its whole subtree', () => {
    const out = serializer.serialize(record, accountAccess(only('experience')));
    expect(out.components.experience).toEqual(
      serializer.serialize(record, accountAccess(FieldSelection.ALL)).components
        .experience,
    );
  });

  it('never copies keys the definition does not have', () => {
    const tampered = {
      ...record,
      values: { ...record.values, injected: 'RAW-injected' },
      passwordHash: 'RAW-hash',
    } as ContentDocument;
    const json = JSON.stringify(
      serializer.serialize(tampered, accountAccess(FieldSelection.ALL)),
    );
    expect(json).not.toContain('RAW-injected');
    expect(json).not.toContain('RAW-hash');
  });

  it('fills missing readable values with null and missing lists with []', () => {
    const empty = { ...record, values: {}, components: {} };
    const out = serializer.serialize(empty, accountAccess(FieldSelection.ALL));
    expect(out.values.name).toBeNull();
    expect(out.components.experience).toEqual([]);
  });

  it('serializeMany serializes each record', () => {
    const out = serializer.serializeMany(
      [record, record],
      accountAccess(only('name')),
    );
    expect(out).toHaveLength(2);
    expect(out[1]?.values.bio).toBe(MASK_SENTINEL);
  });
});

/** Pseudo-loads a record through the projection, as the T20 query will. */
function loadProjected(
  table: TableNode,
  values: Record<string, unknown>,
  components: ComponentTrees,
) {
  const projectedValues = rowToValues(
    table,
    Object.fromEntries(
      table.plan.columns.map((column) => [
        column.name,
        values[column.field.name],
      ]),
    ),
  );
  const projectedComponents: ComponentTrees = {};
  for (const { field, table: child } of table.components) {
    projectedComponents[field.name] = (components[field.name] ?? []).map(
      (node) => ({
        ...node,
        ...loadProjected(child, node.values, node.components),
      }),
    );
  }
  return { values: projectedValues, components: projectedComponents };
}

type SerializedNode = Pick<SerializedComponent, 'values' | 'components'>;

/** Values at a dotted path in the serialized output, across all items. */
function valuesAt(node: SerializedNode, segments: string[]): unknown[] {
  const [head = '', ...rest] = segments;
  if (rest.length === 0) {
    return [
      Object.hasOwn(node.values, head)
        ? node.values[head]
        : node.components[head],
    ];
  }
  return (node.components[head] ?? []).flatMap((item) => valuesAt(item, rest));
}

describe('RecordSerializer account references by actor kind (decision T16)', () => {
  const { record } = rawRecord(type);
  const HIDDEN: readonly ActorKind[] = ACCOUNT_REFERENCES_HIDDEN_FROM;

  it.each(Object.entries(ACTORS_BY_KIND))(
    '%s: createdBy/updatedBy shown only to accounts and API tokens',
    (kind, actor) => {
      const out = serializer.serialize(
        record,
        recordReadAccess(actor, FieldSelection.ALL),
      );
      const hidden = HIDDEN.includes(kind as ActorKind);
      for (const field of ACCOUNT_REFERENCE_FIELDS) {
        expect(Object.hasOwn(out, field)).toBe(!hidden);
      }
      const json = JSON.stringify(out);
      for (const id of Object.values(RAW_ACCOUNT_IDS)) {
        expect(json.includes(String(id))).toBe(!hidden);
      }
      // Omitted, not masked: never listed as a masked content field.
      expect(out[MASKED_FIELDS_KEY]).toEqual([]);
      // Every other system field stays readable.
      for (const field of RECORD_SYSTEM_FIELDS) {
        if (ACCOUNT_REFERENCE_FIELDS.some((ref) => ref === field)) continue;
        expect(Object.hasOwn(out, field)).toBe(true);
      }
    },
  );
});

describe('RecordSerializer property: no unreadable raw value leaks', () => {
  const random = seededRandom(PROPERTY_SEED);
  const { record, raw } = rawRecord(type, 3);

  const randomSelection = (): FieldSelection => {
    const roll = random();
    if (roll < 0.05) return FieldSelection.ALL;
    if (roll < 0.1) return FieldSelection.NONE;
    return only(...ALL_PATHS.filter(() => random() < 0.4));
  };

  const actors = Object.values(ACTORS_BY_KIND);
  const randomActor = () =>
    actors[Math.floor(random() * actors.length)] ?? ACTORS_BY_KIND.anonymous;

  it(`holds for ${PROPERTY_RUNS} random field selections and actor kinds`, () => {
    for (let run = 0; run < PROPERTY_RUNS; run += 1) {
      const readable = randomSelection();
      const actor = randomActor();
      const access = recordReadAccess(actor, readable);
      const hidesAccounts = ACCOUNT_REFERENCES_HIDDEN_FROM.some(
        (kind) => kind === actor.kind,
      );
      const outputs = [
        // Raw record with every value present: the serializer alone must mask.
        serializer.serialize(record, access),
        // Record loaded through the projection (D3): same output.
        serializer.serialize(
          {
            ...record,
            ...loadProjected(
              projectTable(type.root, readable),
              record.values,
              record.components,
            ),
          },
          access,
        ),
      ];
      expect(outputs[1]).toEqual(outputs[0]);

      for (const out of outputs) {
        const json = JSON.stringify(out);
        const masked = new Set(out[MASKED_FIELDS_KEY]);
        for (const field of ACCOUNT_REFERENCE_FIELDS) {
          expect(Object.hasOwn(out, field)).toBe(!hidesAccounts);
        }
        for (const id of Object.values(RAW_ACCOUNT_IDS)) {
          expect(json.includes(String(id))).toBe(!hidesAccounts);
        }
        for (const [path, values] of raw) {
          if (readable.allows(path)) continue;
          for (const value of values) {
            if (typeof value === 'boolean') continue;
            expect(json).not.toContain(JSON.stringify(value));
          }
          // Masked by itself or by a masked component around it.
          const segments = path.split('.');
          const listed = segments.some((_, i) =>
            masked.has(segments.slice(0, i + 1).join('.')),
          );
          expect(listed).toBe(true);
        }
        // Structural check (covers booleans): every masked path holds its mask.
        for (const path of masked) {
          for (const value of valuesAt(out, path.split('.'))) {
            expect([MASK_SENTINEL, null]).toContain(value);
          }
        }
        expect(out[MASKED_FIELDS_KEY]).toEqual(
          maskedFieldPaths(type.root, readable),
        );
      }
    }
  });
});
