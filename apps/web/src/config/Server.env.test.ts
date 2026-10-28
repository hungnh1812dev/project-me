import { DEFAULT_REVALIDATE_SECONDS, parseServerEnv } from './Server.env';

const VALID = { API_INTERNAL_URL: 'http://cms-api:3000/api/v1/' };

describe('parseServerEnv', () => {
  it('reads the values and strips the trailing slash', () => {
    expect(parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: '0' })).toEqual({
      apiInternalUrl: 'http://cms-api:3000/api/v1',
      revalidateSeconds: 0,
    });
  });

  it('defaults the revalidate window when unset or blank', () => {
    expect(parseServerEnv(VALID).revalidateSeconds).toBe(
      DEFAULT_REVALIDATE_SECONDS,
    );
    expect(
      parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: ' ' })
        .revalidateSeconds,
    ).toBe(DEFAULT_REVALIDATE_SECONDS);
  });

  it('fails when API_INTERNAL_URL is missing or not absolute', () => {
    expect(() => parseServerEnv({})).toThrow(/API_INTERNAL_URL is not set/);
    expect(() => parseServerEnv({ API_INTERNAL_URL: '/api/v1' })).toThrow(
      /absolute URL/,
    );
  });

  it.each(['-1', '1.5', 'abc'])(
    'fails on WEB_REVALIDATE_SECONDS=%s',
    (value) => {
      expect(() =>
        parseServerEnv({ ...VALID, WEB_REVALIDATE_SECONDS: value }),
      ).toThrow(/WEB_REVALIDATE_SECONDS/);
    },
  );
});
