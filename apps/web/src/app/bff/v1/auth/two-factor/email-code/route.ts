import { defineBffRoute } from '../../../../../../apis/server/bff/BffRoute.server';
import { TURNSTILE } from '../../../../../../configs/Security.constants';
import {
  emailCodeBodySchema,
  sendTwoFactorEmailCode,
} from '../../../../../../features/session/SignIn.server';

export const { GET, POST, PUT, PATCH, DELETE } = defineBffRoute({
  methods: ['POST'],
  bucket: 'auth',
  bodySchema: emailCodeBodySchema,
  humanCheckAction: TURNSTILE.ACTIONS.TWO_FACTOR,
  handle: sendTwoFactorEmailCode,
});
