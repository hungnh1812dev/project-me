import { EN_TEXT } from '@configs/locales/en';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { failedItems, itemReason, toBulkFailure } from './Bulk.rules';
import { parseImportText } from './BulkCreateDialog';

const bulk = EN_TEXT.content.bulk;

function httpError(status: number, data: unknown) {
  const config = {} as InternalAxiosRequestConfig;
  return new AxiosError('failed', AxiosError.ERR_BAD_REQUEST, config, null, {
    status,
    statusText: String(status),
    data,
    headers: {},
    config,
  });
}

describe('parseImportText', () => {
  it('accepts an array of objects', () => {
    expect(parseImportText('[{"values":{"a":1}},{}]', EN_TEXT)).toEqual({
      items: [{ values: { a: 1 } }, {}],
    });
  });

  it.each([
    ['not json', '{oops', bulk.importDialog.invalidJson],
    ['an object', '{}', bulk.importDialog.notArray],
    ['an empty array', '[]', bulk.importDialog.empty],
    ['a non-object item', '[{}, 3]', bulk.importDialog.badItem(2)],
    ['a null item', '[null]', bulk.importDialog.badItem(1)],
    ['a nested array', '[[]]', bulk.importDialog.badItem(1)],
    [
      'more than 50 items',
      JSON.stringify(Array.from({ length: 51 }, () => ({}))),
      bulk.importDialog.tooMany(50),
    ],
  ])('rejects %s', (_name, text, error) => {
    expect(parseImportText(text, EN_TEXT)).toEqual({ error });
  });
});

describe('toBulkFailure', () => {
  it('reads the failing item of an atomic request', () => {
    expect(
      toBulkFailure(
        httpError(400, {
          errorCode: 'DOCUMENT_INVALID',
          message: 'title is required',
          details: { index: 1, details: {} },
        }),
        EN_TEXT,
      ),
    ).toMatchObject({ index: 1, reason: 'title is required' });
  });

  it('maps request-level codes', () => {
    expect(
      toBulkFailure(httpError(400, { errorCode: 'DOCUMENT_NOT_PUBLISHABLE' }), EN_TEXT).message,
    ).toBe(bulk.errors.notPublishable);
    expect(
      toBulkFailure(httpError(400, { errorCode: 'DOCUMENT_BULK_LIMIT' }), EN_TEXT).message,
    ).toBe(bulk.errors.limit);
    expect(toBulkFailure(httpError(403, {}), EN_TEXT).message).toBe(bulk.errors.forbidden);
    expect(toBulkFailure(new Error('x'), EN_TEXT).message).toBe(bulk.errors.unexpected);
  });
});

describe('itemReason / failedItems', () => {
  it('prefers a friendly text for known codes and falls back otherwise', () => {
    expect(itemReason('DOCUMENT_VERSION_CONFLICT', 'raw', undefined, EN_TEXT)).toBe(
      bulk.itemErrors.conflict,
    );
    expect(itemReason('OTHER', 'raw', undefined, EN_TEXT)).toBe('raw');
    expect(itemReason('OTHER', '', undefined, EN_TEXT)).toBe(bulk.itemErrors.fallback);
  });

  it('keeps only error results', () => {
    const error = {
      index: 1,
      status: 'error' as const,
      statusCode: 404,
      errorCode: 'DOCUMENT_NOT_FOUND',
      message: 'x',
    };
    expect(
      failedItems({
        atomic: false,
        succeeded: 1,
        failed: 1,
        results: [{ index: 0, status: 'ok', documentId: 'a' }, error],
      }),
    ).toEqual([error]);
  });
});
