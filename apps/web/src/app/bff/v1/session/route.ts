import { defineBffRoute } from '../../../../apis/server/bff/BffRoute.server';
import { answerSessionRead } from '../../../../features/session/WebSession.server';

export const { GET } = defineBffRoute({
  methods: ['GET'],
  bucket: 'read',
  handle: answerSessionRead,
});
