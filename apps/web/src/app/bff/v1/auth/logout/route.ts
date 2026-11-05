import { defineBffRoute } from '../../../../../apis/server/bff/BffRoute.server';
import { logOutVisitor } from '../../../../../features/session/SignIn.server';

export const { POST } = defineBffRoute({
  methods: ['POST'],
  bucket: 'auth',
  handle: logOutVisitor,
});
