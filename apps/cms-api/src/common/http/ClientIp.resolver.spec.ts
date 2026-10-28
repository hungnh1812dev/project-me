import type { Request } from 'express';

import { devEnv } from '../../../test/fixtures/Env.fixture';
import { loadAppConfig } from '../../config/AppConfig.setup';
import { ClientIpResolver } from './ClientIp.resolver';
import { UNKNOWN_CLIENT_IP } from '../constants/Limits.constants';

const CF_HEADER = 'cf-connecting-ip';

function fakeRequest(
  ip: string | undefined,
  headers: Record<string, string> = {},
): Request {
  return {
    ip,
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function resolver(clientIpHeader?: string): ClientIpResolver {
  return new ClientIpResolver(
    loadAppConfig(devEnv({ CLIENT_IP_HEADER: clientIpHeader })),
  );
}

describe('ClientIpResolver', () => {
  describe('without CLIENT_IP_HEADER', () => {
    it('uses req.ip (Express applies TRUST_PROXY_HOPS to X-Forwarded-For)', () => {
      expect(resolver().resolve(fakeRequest('203.0.113.7'))).toBe(
        '203.0.113.7',
      );
    });

    it('ignores a client-supplied CF-Connecting-IP', () => {
      expect(
        resolver().resolve(
          fakeRequest('203.0.113.7', { [CF_HEADER]: '198.51.100.1' }),
        ),
      ).toBe('203.0.113.7');
    });

    it('unwraps IPv4-mapped IPv6 and lower-cases IPv6', () => {
      expect(resolver().resolve(fakeRequest('::ffff:203.0.113.7'))).toBe(
        '203.0.113.7',
      );
      expect(resolver().resolve(fakeRequest('2001:DB8::1'))).toBe(
        '2001:db8::1',
      );
    });

    it('falls back to a fixed key when the IP is unknown', () => {
      expect(resolver().resolve(fakeRequest(undefined))).toBe(
        UNKNOWN_CLIENT_IP,
      );
    });
  });

  describe('with CLIENT_IP_HEADER', () => {
    it('reads the configured header', () => {
      expect(
        resolver('CF-Connecting-IP').resolve(
          fakeRequest('10.0.0.2', { [CF_HEADER]: ' 198.51.100.1 ' }),
        ),
      ).toBe('198.51.100.1');
    });

    it.each([
      ['missing', {}],
      ['not an IP', { [CF_HEADER]: 'evil' }],
      ['a list', { [CF_HEADER]: '198.51.100.1, 198.51.100.2' }],
    ])('falls back to req.ip when the header is %s', (_label, headers) => {
      expect(
        resolver(CF_HEADER).resolve(fakeRequest('10.0.0.2', headers)),
      ).toBe('10.0.0.2');
    });
  });
});
