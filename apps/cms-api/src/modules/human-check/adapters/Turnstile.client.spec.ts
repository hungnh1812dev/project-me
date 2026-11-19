import { TURNSTILE_ALWAYS_PASS_TEST_SECRET } from '../../../config/Config.constants';
import {
  TURNSTILE_SITEVERIFY_URL,
  TurnstileClient,
  UnconfiguredTurnstileVerifier,
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

  it('checks the hostname against the list, ignoring case', async () => {
    const reply = replying({ success: true, hostname: 'Domain.com' });
    const strict = (expectedHostnames: string[]) =>
      new TurnstileClient('k', { fetchFn: reply, expectedHostnames });
    await expect(strict(['domain.com']).verify('t')).resolves.toBe('passed');
    await expect(strict(['admin.domain.com', 'domain.com']).verify('t')).resolves.toBe('passed');
    await expect(strict(['other.com']).verify('t')).resolves.toBe('failed');
    const missing = new TurnstileClient('k', {
      fetchFn: replying({ success: true }),
      expectedHostnames: ['domain.com'],
    });
    await expect(missing.verify('t')).resolves.toBe('failed');
  });

  it('compares the action only when one is given', async () => {
    const client = new TurnstileClient('k', {
      fetchFn: replying({ success: true, action: 'login' }),
    });
    await expect(client.verify('t', undefined, 'login')).resolves.toBe('passed');
    await expect(client.verify('t', undefined, 'two-factor')).resolves.toBe('failed');
    await expect(client.verify('t')).resolves.toBe('passed');
  });

  it('skips only the action check with the always-pass test secret', async () => {
    const client = new TurnstileClient(TURNSTILE_ALWAYS_PASS_TEST_SECRET, {
      fetchFn: replying({ success: true, hostname: 'domain.com' }),
      expectedHostnames: ['domain.com'],
    });
    await expect(client.verify('t', undefined, 'login')).resolves.toBe('passed');
    const wrongHost = new TurnstileClient(TURNSTILE_ALWAYS_PASS_TEST_SECRET, {
      fetchFn: replying({ success: true, hostname: 'evil.com' }),
      expectedHostnames: ['domain.com'],
    });
    await expect(wrongHost.verify('t', undefined, 'login')).resolves.toBe('failed');
  });

  it('fails an already used token', async () => {
    const client = new TurnstileClient('k', {
      fetchFn: replying({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    });
    await expect(client.verify('t')).resolves.toBe('failed');
  });

  it.each([
    ['http error', replying({}, false)],
    ['malformed reply', replying({ nope: 1 })],
    ['internal-error', replying({ success: false, 'error-codes': ['internal-error'] })],
    ['network error', () => Promise.reject(new Error('down'))],
  ])('is unavailable on %s', async (_name, fetchFn) => {
    await expect(new TurnstileClient('k', { fetchFn }).verify('t')).resolves.toBe('unavailable');
  });
});

describe('UnconfiguredTurnstileVerifier', () => {
  it('is not configured and never verifies', async () => {
    const verifier = new UnconfiguredTurnstileVerifier();
    expect(verifier.isConfigured).toBe(false);
    await expect(verifier.verify()).resolves.toBe('unavailable');
  });
});
