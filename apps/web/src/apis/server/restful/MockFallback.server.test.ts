// @vitest-environment node

import { fillFromMocks, MOCK_FALLBACK_REASONS } from './MockFallback.server';

const env = vi.hoisted(() => ({ isMockFallbackOn: true }));
vi.mock('../../../configs/Server.env', () => ({ getServerEnv: () => env }));
vi.mock('./mocks/MockView', () => ({
  MOCK_VIEW: {
    PageQuery: { title: { text: 'mock title' }, items: ['mock item'] },
  },
}));

const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

beforeEach(() => {
  warn.mockClear();
  env.isMockFallbackOn = true;
});

describe('fillFromMocks with the fallback on', () => {
  it('fills a missing root field from the mock and warns once', () => {
    const result = fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['title'],
      data: undefined,
      reason: 'network',
    });
    expect(result).toEqual({ data: { title: { text: 'mock title' } }, failedRootFields: [] });
    expect(warn.mock.calls).toEqual([['[mock] PageQuery title network']]);
  });

  it.each(MOCK_FALLBACK_REASONS)('writes the reason %s in the warn line', (reason) => {
    fillFromMocks({ operationName: 'PageQuery', rootFields: ['title'], data: null, reason });
    expect(warn).toHaveBeenCalledWith(`[mock] PageQuery title ${reason}`);
  });

  it('fills a null field and an empty object', () => {
    const nullField = fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['title'],
      data: { title: null },
      reason: 'empty',
    });
    const emptyObject = fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['title'],
      data: { title: {} },
      reason: 'empty',
    });
    expect(nullField.data.title).toEqual({ text: 'mock title' });
    expect(emptyObject.data.title).toEqual({ text: 'mock title' });
  });

  it('fills an empty list but keeps a filled list', () => {
    const emptyList = fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['items'],
      data: { items: [] },
      reason: 'empty',
    });
    const filledList = fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['items'],
      data: { items: ['real item'] },
      reason: 'empty',
    });
    expect(emptyList.data.items).toEqual(['mock item']);
    expect(filledList.data.items).toEqual(['real item']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps real fields and fills only the missing one, one warn line per filled field', () => {
    const result = fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['title', 'items'],
      data: { items: ['real item'] },
      reason: 'graphql-error',
    });
    expect(result.data).toEqual({ title: { text: 'mock title' }, items: ['real item'] });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('leaves null and lists as failed an unknown operation and an unknown root field', () => {
    const unknownOperation = fillFromMocks({
      operationName: 'OtherQuery',
      rootFields: ['title'],
      data: undefined,
      reason: 'http',
    });
    const unknownField = fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['missing'],
      data: undefined,
      reason: 'timeout',
    });
    expect(unknownOperation).toEqual({ data: { title: null }, failedRootFields: ['title'] });
    expect(unknownField).toEqual({ data: { missing: null }, failedRootFields: ['missing'] });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('fillFromMocks with the fallback off', () => {
  it('leaves missing fields null, lists them as failed and does not warn', () => {
    env.isMockFallbackOn = false;
    const result = fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['title', 'items'],
      data: { items: ['real item'] },
      reason: 'network',
    });
    expect(result).toEqual({
      data: { title: null, items: ['real item'] },
      failedRootFields: ['title'],
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
