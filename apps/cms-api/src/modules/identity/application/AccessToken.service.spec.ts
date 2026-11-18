import { randomUUID } from 'node:crypto';

import { sign } from 'jsonwebtoken';

import { Clock } from '../../../common/time/Clock.service';
import { JWT_ALGORITHM, TOKEN_TYPES } from '../domain/Identity.constants';
import { AccessTokenService } from './AccessToken.service';

const KID = 'test-kid';
const SECRET = 'a'.repeat(32);
const SUBJECT = { sub: randomUUID(), tv: 3 };

function build() {
  const config = { auth: { jwtAccessKid: KID }, secrets: { jwtAccessSecret: SECRET } };
  return new AccessTokenService(config as never, new Clock());
}

function rawTempToken(extra: Record<string, unknown>): string {
  return sign({ ...SUBJECT, typ: TOKEN_TYPES.TWO_FACTOR, kid: KID, ...extra }, SECRET, {
    algorithm: JWT_ALGORITHM,
    keyid: KID,
    expiresIn: 300,
    jwtid: randomUUID(),
  });
}

describe('AccessTokenService 2FA temp token remember-me claim (rm)', () => {
  it.each([true, false])('writes rm=%s and reads it back', (rememberMe) => {
    const service = build();
    const token = service.signTwoFactorTempToken({ ...SUBJECT, rememberMe });
    expect(service.verifyTwoFactorTempToken(token)?.rm).toBe(rememberMe);
  });

  it('reads a token without rm as false', () => {
    expect(build().verifyTwoFactorTempToken(rawTempToken({}))?.rm).toBe(false);
  });

  it.each([['true'], [1], [null]])('refuses a token whose rm is %p', (rm) => {
    expect(build().verifyTwoFactorTempToken(rawTempToken({ rm }))).toBeUndefined();
  });
});
