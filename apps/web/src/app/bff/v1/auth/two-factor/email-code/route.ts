import { defineBffRoute } from '../../../../../../apis/server/bff/BffRoute.server';
import { TURNSTILE } from '../../../../../../configs/Security.constants';
import {
  emailCodeBodySchema,
  sendTwoFactorEmailCode,
} from '../../../../../../features/session/SignIn.server';

export const { POST } = defineBffRoute({
  methods: ['POST'],
  bucket: 'auth',
  bodySchema: emailCodeBodySchema,
  humanCheckAction: TURNSTILE.ACTIONS.TWO_FACTOR,
  handle: sendTwoFactorEmailCode,
});
