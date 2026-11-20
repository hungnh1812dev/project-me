import { expect, test } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { HTTP } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { withHumanCheck } from '../src/Session.fixture';

/** The human-check guard of the sign-in routes, called straight on cms-api; nothing is written. */
test.describe('human check guard', { tag: ['@cms-api', '@sign-in'] }, () => {
  const REFUSAL_CODE = 'HUMAN_CHECK_FAILED';
  // Only login: request-otp and reset are rate limited, and every call here would eat the budget PasswordReset needs.
  const guardedPaths = [API_PATHS.AUTH.LOGIN];

  for (const path of guardedPaths) {
    test(`${path} refuses a request without the token and accepts the dummy token`, async ({
      request,
    }) => {
      const credentials = { email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword };

      const refused = await request.post(apiUrl(path), { data: credentials });
      expect(refused.status()).toBe(HTTP.BAD_REQUEST);
      expect(((await refused.json()) as { errorCode: string }).errorCode).toBe(REFUSAL_CODE);

      const passed = await request.post(apiUrl(path), { data: withHumanCheck({}) });
      const body = (await passed.json()) as { errorCode?: string };
      expect(body.errorCode).not.toBe(REFUSAL_CODE);
    });
  }
});
