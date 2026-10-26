import { expect, test } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/ApiPaths.constants';
import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';

/**
 * SPEC §12-2 and §12-17 through the real edge (Traefik in front of cms-api):
 * the jest tests cover cms-api alone, this proves the routing keeps the
 * answers. Sends no valid credential, so it spends no session.
 */
const { LOGIN, REGISTER } = API_PATHS.AUTH;
const CREDENTIALS = {
  email: `nobody@${new URL(e2eEnv.webUrl).hostname}`,
  password: 'definitely-wrong-password',
};

test('login with a trailing slash is answered by the API, never redirected (§12-17)', async ({
  request,
}) => {
  for (const path of [LOGIN, `${LOGIN}/`]) {
    const response = await request.post(apiUrl(path), {
      data: CREDENTIALS,
      maxRedirects: 0,
    });
    expect(response.status(), path).toBe(HTTP.UNAUTHORIZED);
    expect(response.headers()['location']).toBeUndefined();
  }
});

test('no route registers an account, with or without a trailing slash (§12-2)', async ({
  request,
}) => {
  for (const path of [REGISTER, `${REGISTER}/`]) {
    const response = await request.post(apiUrl(path), {
      data: CREDENTIALS,
      maxRedirects: 0,
    });
    expect(response.status(), path).toBe(HTTP.NOT_FOUND);
  }
});
