import { DomainError } from '../../../common/errors/Domain.errors';

import {
  accountAccess,
  profileType,
  rawRecord,
} from '../../../../test/fixtures/Masking.fixture';
import { assertTreeInput } from '../../content-engine';
import {
  ACCESS_ERROR_CODES,
  MASK_SENTINEL,
  MASKED_FIELDS_KEY,
} from './Access.constants';
import { type FieldAccess, FieldSelection } from './PolicyEvaluator.rules';
import { RecordSerializer } from './RecordSerializer.rules';
import { WriteAllowlist } from './WriteAllowlist.rules';

const type = profileType();
const allowlist = new WriteAllowlist(type);
const serializer = new RecordSerializer(type);

const access = (
  readable: string[] | null,
  writable: string[] | null,
): FieldAccess => ({
  readable: FieldSelection.of(readable),
  writable: FieldSelection.of(writable),
});
const FULL = access(null, null);

function errorCodeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return error.errorCode;
  }
  throw new Error('expected a 400');
}

describe('WriteAllowlist', () => {
  it('keeps writable values and component items', () => {
    const payload = {
      values: { name: 'Ada', age: 36 },
      components: {
        experience: [
          {
            componentUid: '00000000-0000-4000-8000-000000000001',
            values: { company: 'Acme' },
            components: { roles: [{ values: { title: 'Lead' } }] },
          },
        ],
      },
    };
    expect(allowlist.apply(payload, FULL)).toEqual(payload);
  });

  it('drops a masked field that comes back with the sentinel (SPEC §12-5)', () => {
    const fields = access(['age'], ['age']);
    expect(
      allowlist.apply(
        { values: { name: MASK_SENTINEL, salary: null, age: 3 } },
        fields,
      ),
    ).toEqual({ values: { age: 3 } });
  });

  it('drops a masked component that comes back as null', () => {
    expect(
      allowlist.apply(
        { components: { contact: null, experience: null } },
        access([], []),
      ),
    ).toEqual({ components: {} });
  });

  it('drops masked sub-fields inside items of a writable component', () => {
    const fields = access(['experience.years'], ['experience']);
    expect(
      allowlist.apply(
        {
          components: {
            experience: [
              {
                componentUid: '00000000-0000-4000-8000-000000000001',
                values: { company: MASK_SENTINEL, years: 4 },
                components: { roles: null },
              },
            ],
          },
        },
        fields,
      ),
    ).toEqual({
      components: {
        experience: [
          {
            componentUid: '00000000-0000-4000-8000-000000000001',
            values: { years: 4 },
            components: {},
          },
        ],
      },
    });
  });

  it('drops the sentinel even on a writable but unreadable field', () => {
    expect(
      allowlist.apply({ values: { name: MASK_SENTINEL } }, access([], null)),
    ).toEqual({ values: {} });
  });

  it('writes a real value to a writable but unreadable field', () => {
    expect(
      allowlist.apply({ values: { name: 'new' } }, access([], null)),
    ).toEqual({ values: { name: 'new' } });
  });

  it('rejects a non-writable, non-masked field with 400 (SPEC §12-5)', () => {
    expect(
      errorCodeOf(() =>
        allowlist.apply({ values: { name: 'x' } }, access(null, ['age'])),
      ),
    ).toBe(ACCESS_ERROR_CODES.FIELD_NOT_WRITABLE);
  });

  it('rejects a masked field that comes back with a value other than its mask', () => {
    for (const values of [{ name: 'changed' }, { name: null }, { age: 0 }]) {
      expect(
        errorCodeOf(() => allowlist.apply({ values }, access([], []))),
      ).toBe(ACCESS_ERROR_CODES.FIELD_NOT_WRITABLE);
    }
  });

  it('rejects a sentinel-looking value of the wrong type for the field', () => {
    expect(
      errorCodeOf(() =>
        allowlist.apply({ values: { age: MASK_SENTINEL } }, access([], [])),
      ),
    ).toBe(ACCESS_ERROR_CODES.FIELD_NOT_WRITABLE);
  });

  it('rejects a component list when only some sub-fields are writable', () => {
    expect(
      errorCodeOf(() =>
        allowlist.apply(
          { components: { contact: [{ values: { phone: '1' } }] } },
          access(null, ['contact.phone']),
        ),
      ),
    ).toBe(ACCESS_ERROR_CODES.FIELD_NOT_WRITABLE);
  });

  it('rejects unknown keys at every level with 400 FIELD_UNKNOWN', () => {
    const cases: unknown[] = [
      { values: { nope: 1 } },
      { values: { contact: null } },
      { components: { name: [] } },
      { components: { experience: [{ values: { nope: 1 } }] } },
      { components: { experience: [{ id: 1 }] } },
      { version: 2 },
      { componentUid: '00000000-0000-4000-8000-000000000001' },
      JSON.parse('{"values":{"__proto__":{"polluted":true}}}'),
      { values: { constructor: 'x' } },
    ];
    for (const payload of cases) {
      expect(errorCodeOf(() => allowlist.apply(payload, FULL))).toBe(
        ACCESS_ERROR_CODES.FIELD_UNKNOWN,
      );
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects payloads that are not a tree', () => {
    for (const payload of [
      null,
      [],
      'x',
      { values: [] },
      { components: { experience: {} } },
      { components: { experience: [null] } },
    ]) {
      expect(errorCodeOf(() => allowlist.apply(payload, FULL))).toBe(
        'BAD_REQUEST',
      );
    }
  });

  it('ignores client-sent _maskedFields (C5)', () => {
    expect(
      allowlist.apply(
        {
          [MASKED_FIELDS_KEY]: ['age'],
          values: { age: 1 },
          components: {
            experience: [{ [MASKED_FIELDS_KEY]: ['x'], values: { years: 2 } }],
          },
        },
        FULL,
      ),
    ).toEqual({
      values: { age: 1 },
      components: { experience: [{ values: { years: 2 } }] },
    });
  });

  it('a client cannot unmask a field by sending _maskedFields', () => {
    expect(
      errorCodeOf(() =>
        allowlist.apply(
          { [MASKED_FIELDS_KEY]: [], values: { name: 'x' } },
          access(null, []),
        ),
      ),
    ).toBe(ACCESS_ERROR_CODES.FIELD_NOT_WRITABLE);
  });

  it('round-trips a serialized record: masked fields are never written', () => {
    const { record } = rawRecord(type);
    const fields = access(
      ['name', 'experience.years', 'experience.roles.title'],
      ['name', 'experience'],
    );
    const served = serializer.serialize(record, accountAccess(fields.readable));
    const tree = allowlist.apply(
      {
        values: { name: served.values.name },
        components: { experience: served.components.experience },
        [MASKED_FIELDS_KEY]: served[MASKED_FIELDS_KEY],
      },
      fields,
    );
    expect(() => assertTreeInput(type.root, tree)).not.toThrow();
    const json = JSON.stringify(tree);
    expect(json).not.toContain(MASK_SENTINEL);
    expect(json).not.toContain('"company"');
    expect(json).not.toContain('"budget"');
    expect(json).toContain('"years"');
  });
});
