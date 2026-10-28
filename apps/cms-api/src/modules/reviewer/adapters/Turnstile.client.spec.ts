import {
  TURNSTILE_SITEVERIFY_URL,
  TurnstileClient,
  type HttpFetch,
} from './Turnstile.client';

function replying(json: unknown, ok = true): HttpFetch {
  return () => Promise.resolve({ ok, json: () => Promise.resolve(json) });
}

describe('TurnstileClient', () => {
  it('passes on success and sends secret, response and ip as a form', async () => {
    const calls: { url: string; body: URLSearchParams }[] = [];
    const client = new TurnstileClient('s3cret', {
      fetchFn: (url, init) => {
        calls.push({ url, body: init.body });
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      },
    });
    await expect(client.verify('tok', '203.0.113.9')).resolves.toBe('passed');
    expect(calls[0]?.url).toBe(TURNSTILE_SITEVERIFY_URL);
    expect(calls[0]?.body.get('secret')).toBe('s3cret');
    expect(calls[0]?.body.get('response')).toBe('tok');
    expect(calls[0]?.body.get('remoteip')).toBe('203.0.113.9');
  });

  it('fails when Cloudflare refuses the token', async () => {
    const client = new TurnstileClient('k', {
      fetchFn: replying({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    });
    await expect(client.verify('tok')).resolves.toBe('failed');
  });

  it('checks the hostname when one is expected', async () => {
    const reply = replying({ success: true, hostname: 'Domain.com' });
    const strict = (expectedHostname: string) =>
      new TurnstileClient('k', { fetchFn: reply, expectedHostname });
    await expect(strict('domain.com').verify('t')).resolves.toBe('passed');
    await expect(strict('other.com').verify('t')).resolves.toBe('failed');
    const missing = new TurnstileClient('k', {
      fetchFn: replying({ success: true }),
      expectedHostname: 'domain.com',
    });
    await expect(missing.verify('t')).resolves.toBe('failed');
  });

  it.each([
    ['http error', replying({}, false)],
    ['malformed reply', replying({ nope: 1 })],
    [
      'internal-error',
      replying({ success: false, 'error-codes': ['internal-error'] }),
    ],
    ['network error', () => Promise.reject(new Error('down'))],
  ])('is unavailable on %s', async (_name, fetchFn) => {
    await expect(
      new TurnstileClient('k', { fetchFn }).verify('t'),
    ).resolves.toBe('unavailable');
  });
});
