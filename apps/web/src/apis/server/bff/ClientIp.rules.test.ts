import { visitorIpOf } from './ClientIp.rules';

const headersOf = (init: Record<string, string>) => new Headers(init);

describe('visitorIpOf', () => {
  it('takes the hop-th address from the right of X-Forwarded-For', () => {
    const headers = headersOf({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.0.0.1' });
    expect(visitorIpOf(headers, { trustProxyHops: 1 })).toBe('10.0.0.1');
    expect(visitorIpOf(headers, { trustProxyHops: 2 })).toBe('203.0.113.9');
  });

  it('ignores a client-chosen left entry when one proxy is trusted', () => {
    const headers = headersOf({ 'x-forwarded-for': '1.2.3.4, 198.51.100.7' });
    expect(visitorIpOf(headers, { trustProxyHops: 1 })).toBe('198.51.100.7');
  });

  it('prefers the client IP header when it carries an address', () => {
    const headers = headersOf({ 'cf-connecting-ip': '2001:db8::1', 'x-forwarded-for': '10.0.0.1' });
    expect(visitorIpOf(headers, { trustProxyHops: 1, clientIpHeader: 'CF-Connecting-IP' })).toBe(
      '2001:db8::1',
    );
  });

  it('falls back to X-Forwarded-For when the client IP header is missing or invalid', () => {
    const config = { trustProxyHops: 1, clientIpHeader: 'cf-connecting-ip' };
    expect(visitorIpOf(headersOf({ 'x-forwarded-for': '10.0.0.1' }), config)).toBe('10.0.0.1');
    expect(
      visitorIpOf(headersOf({ 'cf-connecting-ip': 'nope', 'x-forwarded-for': '10.0.0.1' }), config),
    ).toBe('10.0.0.1');
  });

  it.each([
    ['no header', {}, 1],
    ['hops 0 trusts nothing', { 'x-forwarded-for': '10.0.0.1' }, 0],
    ['fewer entries than hops', { 'x-forwarded-for': '10.0.0.1' }, 2],
    ['not an address', { 'x-forwarded-for': 'garbage' }, 1],
  ])('is undefined for %s', (_name, init, trustProxyHops) => {
    expect(visitorIpOf(headersOf(init), { trustProxyHops })).toBeUndefined();
  });
});
