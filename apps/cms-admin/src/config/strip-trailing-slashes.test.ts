import { stripTrailingSlashes } from './strip-trailing-slashes';

describe('stripTrailingSlashes', () => {
  it.each([
    ['/health/live/', '/health/live'],
    ['/health/live//', '/health/live'],
    ['/health/live', '/health/live'],
    ['/health/live/?verbose=1', '/health/live?verbose=1'],
    ['/health/live/#top', '/health/live#top'],
    ['/search?q=a/', '/search?q=a/'],
    ['http://domain.localhost/api/v1/', 'http://domain.localhost/api/v1'],
    ['/', ''],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(stripTrailingSlashes(input)).toBe(expected);
  });
});
