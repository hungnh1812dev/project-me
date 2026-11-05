import { defineBffRoute } from '../../../../apis/server/bff/BffRoute.server';
import { answerCvRead } from '../../../../features/cv/CvPage.server';

export const { GET } = defineBffRoute({
  methods: ['GET'],
  bucket: 'read',
  handle: answerCvRead,
});
