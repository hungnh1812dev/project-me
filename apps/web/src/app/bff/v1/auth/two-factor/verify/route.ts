import { defineBffRoute } from '../../../../../../apis/server/bff/BffRoute.server';
import { TURNSTILE } from '../../../../../../configs/Security.constants';
import {
  verifyBodySchema,
  verifyTwoFactorCode,
} from '../../../../../../features/session/SignIn.server';

export const { POST } = defineBffRoute({
  methods: ['POST'],
  bucket: 'auth',
  bodySchema: verifyBodySchema,
  humanCheckAction: TURNSTILE.ACTIONS.TWO_FACTOR,
  handle: verifyTwoFactorCode,
});
