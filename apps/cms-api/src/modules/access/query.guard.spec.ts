import { BadRequestException } from '@nestjs/common';

import {
  accountAccess,
  ACTORS_BY_KIND,
  profileType,
} from '../../../test/fixtures/masking.fixture';
import {
  ACCESS_ERROR_CODES,
  ACCOUNT_REFERENCE_FIELDS,
  RECORD_SYSTEM_FIELDS,
} from './access.constants';
import { FieldSelection } from './policy-evaluator';
import { QueryGuard, type QueryFieldUse } from './query.guard';
import { type RecordReadAccess, recordReadAccess } from './record-read-access';

const guard = new QueryGuard(profileType());
const readable = accountAccess(
  FieldSelection.of(['name', 'experience.years', 'contact']),
);

function errorCodeOf(
  use: QueryFieldUse,
  access: RecordReadAccess = readable,
): string | undefined {
  try {
    guard.assert(use, access);
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    return (error.getResponse() as { errorCode: string }).errorCode;
  }
  return undefined;
}

describe('QueryGuard', () => {
  it('allows readable fields, covered sub-fields and system fields', () => {
    expect(
      errorCodeOf({
        filter: ['name', 'contact.phone', 'experience.years'],
        sort: [...RECORD_SYSTEM_FIELDS],
        search: ['name'],
      }),
    ).toBeUndefined();
    expect(errorCodeOf({})).toBeUndefined();
  });

  it.each<[string, QueryFieldUse]>([
    ['filter', { filter: ['salary'] }],
    ['sort', { sort: ['bio'] }],
    ['search', { search: ['summary'] }],
    ['nested filter', { filter: ['experience.company'] }],
    ['component of a partly readable field', { sort: ['experience'] }],
    ['after readable ones', { filter: ['name', 'experience.roles.title'] }],
  ])('rejects %s on an unreadable field with FIELD_NOT_READABLE', (_, use) => {
    expect(errorCodeOf(use)).toBe(ACCESS_ERROR_CODES.FIELD_NOT_READABLE);
  });

  it('rejects everything but system fields when nothing is readable', () => {
    expect(() =>
      guard.assert({ sort: ['name'] }, accountAccess(FieldSelection.NONE)),
    ).toThrow(BadRequestException);
    expect(() =>
      guard.assert({ sort: ['createdAt'] }, accountAccess(FieldSelection.NONE)),
    ).not.toThrow();
  });

  it.each(['nope', 'id', 'experience.nope', 'Name', '__proto__', ''])(
    'rejects unknown field %p with FIELD_UNKNOWN',
    (path) => {
      expect(errorCodeOf({ filter: [path] })).toBe(
        ACCESS_ERROR_CODES.FIELD_UNKNOWN,
      );
    },
  );

  describe('account references (decision T16)', () => {
    const OTHER_SYSTEM_FIELDS = RECORD_SYSTEM_FIELDS.filter(
      (field) => !ACCOUNT_REFERENCE_FIELDS.some((ref) => ref === field),
    );

    it.each(['reviewer', 'anonymous'] as const)(
      'rejects filter/sort/search on createdBy/updatedBy for %s actors',
      (kind) => {
        const access = recordReadAccess(
          ACTORS_BY_KIND[kind],
          FieldSelection.ALL,
        );
        for (const field of ACCOUNT_REFERENCE_FIELDS) {
          for (const use of [
            { filter: [field] },
            { sort: [field] },
            { search: [field] },
          ]) {
            expect(errorCodeOf(use, access)).toBe(
              ACCESS_ERROR_CODES.FIELD_NOT_READABLE,
            );
          }
        }
        expect(() =>
          guard.assert(
            { filter: OTHER_SYSTEM_FIELDS, sort: OTHER_SYSTEM_FIELDS },
            access,
          ),
        ).not.toThrow();
      },
    );

    it.each(['account', 'api_token'] as const)(
      'allows createdBy/updatedBy for %s actors',
      (kind) => {
        const access = recordReadAccess(
          ACTORS_BY_KIND[kind],
          FieldSelection.NONE,
        );
        expect(() =>
          guard.assert(
            { filter: [...ACCOUNT_REFERENCE_FIELDS], sort: ['createdBy'] },
            access,
          ),
        ).not.toThrow();
      },
    );
  });
});
