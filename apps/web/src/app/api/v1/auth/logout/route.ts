import { defineBffRoute } from '../../../../../apis/server/bff/BffRoute.server';
import { logOutVisitor } from '../../../../../features/session/SignIn.server';

export const { GET, POST, PUT, PATCH, DELETE } = defineBffRoute({
  methods: ['POST'],
  bucket: 'auth',
  handle: logOutVisitor,
});
