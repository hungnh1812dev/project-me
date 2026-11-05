import { defineBffRoute } from '../../../../../apis/server/bff/BffRoute.server';
import { TURNSTILE } from '../../../../../configs/Security.constants';
import { loginBodySchema, logInVisitor } from '../../../../../features/session/SignIn.server';

export const { POST } = defineBffRoute({
  methods: ['POST'],
  bucket: 'auth',
  bodySchema: loginBodySchema,
  humanCheckAction: TURNSTILE.ACTIONS.LOGIN,
  handle: logInVisitor,
});
