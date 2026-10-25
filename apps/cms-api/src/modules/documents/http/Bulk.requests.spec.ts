import { BadRequestException } from '@nestjs/common';

import { BULK_LIMITS } from '../domain/Documents.constants';
import {
  parseBulkCreateBody,
  parseBulkDocumentsBody,
  parseBulkPublishBody,
} from './Bulk.requests';

const ID_A = '8d8f1c4e-0000-4000-8000-00000000000a';
const ID_B = '8d8f1c4e-0000-4000-8000-00000000000b';

describe('bulk body parsing (T34)', () => {
  it('takes atomic and items', () => {
    expect(parseBulkCreateBody({ atomic: true, items: [{}] })).toEqual({
      atomic: true,
      items: [{}],
    });
  });

  it.each([
    ['no atomic', { items: [{}] }],
    ['non-boolean atomic', { atomic: 1, items: [{}] }],
    ['empty items', { atomic: true, items: [] }],
    ['unknown key', { atomic: true, items: [{}], extra: 1 }],
    ['not an object', []],
  ])('rejects %s', (_, body) => {
    expect(() => parseBulkCreateBody(body)).toThrow(BadRequestException);
  });

  it('accepts the item cap and rejects one more', () => {
    const items = (n: number) => Array.from({ length: n }, () => ({}));
    expect(() =>
      parseBulkCreateBody({
        atomic: false,
        items: items(BULK_LIMITS.MAX_ITEMS),
      }),
    ).not.toThrow();
    expect(() =>
      parseBulkCreateBody({
        atomic: false,
        items: items(BULK_LIMITS.MAX_ITEMS + 1),
      }),
    ).toThrow(BadRequestException);
  });

  it('publish items need documentId and expectedVersion, no duplicates', () => {
    expect(
      parseBulkPublishBody({
        atomic: false,
        items: [{ documentId: ID_A, expectedVersion: 2 }],
      }).items,
    ).toEqual([{ documentId: ID_A, expectedVersion: 2 }]);
    expect(() =>
      parseBulkPublishBody({ atomic: false, items: [{ documentId: ID_A }] }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseBulkPublishBody({
        atomic: false,
        items: [
          { documentId: ID_A, expectedVersion: 1 },
          { documentId: ID_A.toUpperCase(), expectedVersion: 1 },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('unpublish and delete items are document ids', () => {
    expect(
      parseBulkDocumentsBody({
        atomic: true,
        items: [{ documentId: ID_A }, { documentId: ID_B }],
      }).items,
    ).toEqual([ID_A, ID_B]);
    expect(() =>
      parseBulkDocumentsBody({
        atomic: true,
        items: [{ documentId: ID_A, expectedVersion: 1 }],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseBulkDocumentsBody({ atomic: true, items: [{ documentId: 'x' }] }),
    ).toThrow(BadRequestException);
  });
});
