import { defineBffRoute } from '../../../../apis/server/bff/BffRoute.server';
import { answerHealthRead } from '../../../../features/status/Health.server';

export const { GET } = defineBffRoute({
  methods: ['GET'],
  bucket: 'read',
  handle: answerHealthRead,
});
