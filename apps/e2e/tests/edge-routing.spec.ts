import { expect, test } from '@playwright/test';

import { HTTP } from '../src/constants';
import { e2eEnv } from '../src/env';

/**
 * SPEC §12-2 and §12-17 through the real edge (Traefik in front of cms-api):
 * the jest tests cover cms-api alone, this proves the routing keeps the
 * answers. Sends no valid credential, so it spends no session.
 */
const AUTH_LOGIN = '/auth/login';
const AUTH_REGISTER = '/auth/register';
const CREDENTIALS = {
  email: `nobody@${new URL(e2eEnv.webUrl).hostname}`,
  password: 'definitely-wrong-password',
};

test('login with a trailing slash is answered by the API, never redirected (§12-17)', async ({
  request,
}) => {
  for (const path of [AUTH_LOGIN, `${AUTH_LOGIN}/`]) {
    const res = await request.post(`${e2eEnv.apiBaseUrl}${path}`, {
      data: CREDENTIALS,
      maxRedirects: 0,
    });
    expect(res.status(), path).toBe(HTTP.UNAUTHORIZED);
    expect(res.headers()['location']).toBeUndefined();
  }
});

test('no route registers an account, with or without a trailing slash (§12-2)', async ({
  request,
}) => {
  for (const path of [AUTH_REGISTER, `${AUTH_REGISTER}/`]) {
    const res = await request.post(`${e2eEnv.apiBaseUrl}${path}`, {
      data: CREDENTIALS,
      maxRedirects: 0,
    });
    expect(res.status(), path).toBe(HTTP.NOT_FOUND);
  }
});
