import { defineBffRoute } from '@/apis/server/bff/BffRoute.server';
import { verifyBodySchema, verifyTwoFactorCode } from '@/features/session/SignIn.server';

export const { GET, POST, PUT, PATCH, DELETE } = defineBffRoute({
  methods: ['POST'],
  bucket: 'auth',
  bodySchema: verifyBodySchema,
  handle: verifyTwoFactorCode,
});
