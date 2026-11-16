// @vitest-environment node

import { fillFromMocks } from './MockFallback.server';

const env = vi.hoisted(() => ({ isMockFallbackOn: true }));
vi.mock('../../../configs/Server.env', () => ({ getServerEnv: () => env }));
vi.mock('./mocks/MockView', () => ({
  MOCK_VIEW: { title: { text: 'mock title' }, items: ['mock item'], shared: { text: 'shared' } },
}));
const connectionMock = vi.hoisted(() => vi.fn<() => Promise<void>>(() => Promise.resolve()));
vi.mock('next/server', () => ({ connection: connectionMock }));

const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

beforeEach(() => {
  warn.mockClear();
  connectionMock.mockClear();
  env.isMockFallbackOn = true;
  vi.unstubAllEnvs();
});

const failed = (...names: string[]) => new Map(names.map((name) => [name, 'NETWORK' as const]));

describe('fillFromMocks with the fallback on', () => {
  it('fills a failed root field by its own name, warns once and opts out of caching', async () => {
    const result = await fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['title'],
      mockKeys: {},
      data: null,
      failures: failed('title'),
      singleTypeRootFields: [],
    });
    expect(result).toEqual({ data: { title: { text: 'mock title' } }, failedRootFields: [] });
    expect(warn.mock.calls).toEqual([['[mock] PageQuery title title NETWORK']]);
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it('picks the mock by the mock key of the root field', async () => {
    const result = await fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['heading'],
      mockKeys: { heading: 'title' as never },
      data: null,
      failures: new Map([['heading', 'TIMEOUT']]),
      singleTypeRootFields: [],
    });
    expect(result.data.heading).toEqual({ text: 'mock title' });
    expect(warn).toHaveBeenCalledWith('[mock] PageQuery heading title TIMEOUT');
  });

  it('keeps null and empty root fields that did not fail, with no mock and no warn', async () => {
    const result = await fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['title', 'items'],
      mockKeys: {},
      data: { title: null, items: [] },
      failures: new Map(),
      singleTypeRootFields: [],
    });
    expect(result).toEqual({ data: { title: null, items: [] }, failedRootFields: [] });
    expect(warn).not.toHaveBeenCalled();
    expect(connectionMock).not.toHaveBeenCalled();
  });

  it('keeps real fields and fills only the failed one', async () => {
    const result = await fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['title', 'items'],
      mockKeys: {},
      data: { items: ['real item'] },
      failures: failed('title'),
      singleTypeRootFields: [],
    });
    expect(result.data).toEqual({ title: { text: 'mock title' }, items: ['real item'] });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('lists a failed root field with no mock as failed and null', async () => {
    const result = await fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['missing'],
      mockKeys: {},
      data: null,
      failures: failed('missing'),
      singleTypeRootFields: [],
    });
    expect(result).toEqual({ data: { missing: null }, failedRootFields: ['missing'] });
    expect(connectionMock).not.toHaveBeenCalled();
  });
});

describe('fillFromMocks with a single type', () => {
  const input = {
    operationName: 'PageQuery',
    rootFields: ['title', 'items'],
    mockKeys: {},
    singleTypeRootFields: ['title'],
    failures: new Map<string, 'NETWORK'>(),
  };

  it('mocks a single type that answered null, warns once and opts out of caching', async () => {
    const result = await fillFromMocks({ ...input, data: { title: null, items: [] } });
    expect(result).toEqual({
      data: { title: { text: 'mock title' }, items: [] },
      failedRootFields: [],
    });
    expect(warn.mock.calls).toEqual([['[mock] PageQuery title title NULL_SINGLE_TYPE']]);
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it('mocks a single type missing from the data', async () => {
    const result = await fillFromMocks({ ...input, data: { items: [] } });
    expect(result.data.title).toEqual({ text: 'mock title' });
  });

  it('keeps a single type that answered, and never mocks an empty or null collection', async () => {
    const result = await fillFromMocks({
      ...input,
      data: { title: { text: 'real' }, items: null },
    });
    expect(result.data).toEqual({ title: { text: 'real' }, items: null });
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps a null single type null and not failed when the mocks are off', async () => {
    env.isMockFallbackOn = false;
    const result = await fillFromMocks({ ...input, data: { title: null, items: [] } });
    expect(result).toEqual({ data: { title: null, items: [] }, failedRootFields: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps a null single type null and not failed when no mock exists under its key', async () => {
    const result = await fillFromMocks({
      ...input,
      rootFields: ['absent'],
      singleTypeRootFields: ['absent'],
      data: { absent: null },
    });
    expect(result).toEqual({ data: { absent: null }, failedRootFields: [] });
    expect(connectionMock).not.toHaveBeenCalled();
  });

  it('logs a failed single type once, with its error code', async () => {
    const result = await fillFromMocks({
      ...input,
      data: null,
      failures: new Map([['title', 'TIMEOUT' as const]]),
    });
    expect(result.data.title).toEqual({ text: 'mock title' });
    expect(warn.mock.calls).toEqual([['[mock] PageQuery title title TIMEOUT']]);
  });
});

describe('fillFromMocks with the fallback off', () => {
  it('leaves failed fields null and listed, and does not warn', async () => {
    env.isMockFallbackOn = false;
    const result = await fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['title', 'items'],
      mockKeys: {},
      data: { items: ['real item'] },
      failures: failed('title'),
      singleTypeRootFields: [],
    });
    expect(result).toEqual({
      data: { title: null, items: ['real item'] },
      failedRootFields: ['title'],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('never loads a mock when the build APP_ENV is production', async () => {
    vi.stubEnv('APP_ENV_BUILD', 'production');
    const result = await fillFromMocks({
      operationName: 'PageQuery',
      rootFields: ['title'],
      mockKeys: {},
      data: null,
      failures: failed('title'),
      singleTypeRootFields: [],
    });
    expect(result.failedRootFields).toEqual(['title']);
  });
});
