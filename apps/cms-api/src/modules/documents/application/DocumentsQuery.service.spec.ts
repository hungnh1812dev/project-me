import { DOMAIN_ERROR_KINDS } from '../../../common/errors/DomainErrorKinds.constants';
import type { ActorContext, RolePolicy } from '../../access';
import { DOCUMENT_ERROR_MESSAGES } from '../domain/Documents.constants';
import { DocumentsQueryService } from './DocumentsQuery.service';

const ROLE: RolePolicy = {
  id: 1,
  slug: 'reader',
  rank: 10,
  isSystem: false,
  policyVersion: 1,
  permissions: [],
};
const ACTOR: ActorContext = { kind: 'account', accountId: 7, role: ROLE };

interface Fakes {
  isContentType?: boolean;
  canReadDrafts?: boolean;
  isReadAllowed?: boolean;
}

function build(fakes: Fakes = {}) {
  const evaluator = {
    canReadDrafts: () => fakes.canReadDrafts ?? true,
    rowFilter: () => ({ allowed: fakes.isReadAllowed ?? true, where: null }),
    fieldsFor: () => ({ readable: { kind: 'all' } }),
  };
  return new DocumentsQueryService(
    {
      policy: () =>
        Promise.resolve({
          catalog: { isContentType: () => fakes.isContentType ?? true },
          evaluator,
        }),
    } as never,
    {
      registry: () =>
        Promise.resolve({
          resolve: () => ({ definition: { draftAndPublish: true } }),
        }),
    } as never,
    { findOne: () => Promise.resolve(undefined) } as never,
    {} as never,
  );
}

describe('DocumentsQueryService.get', () => {
  it('answers an unknown content type with the default 404', async () => {
    await expect(
      build({ isContentType: false }).get(ACTOR, 'x', 'id', 'published'),
    ).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
      hasMessage: false,
    });
  });

  it('refuses drafts the actor may not read', async () => {
    await expect(
      build({ canReadDrafts: false }).get(ACTOR, 'x', 'id', 'draft'),
    ).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.FORBIDDEN,
      message: DOCUMENT_ERROR_MESSAGES.DRAFTS_FORBIDDEN,
    });
  });

  it('refuses an actor without read permission', async () => {
    await expect(
      build({ isReadAllowed: false }).get(ACTOR, 'x', 'id', 'published'),
    ).rejects.toMatchObject({ kind: DOMAIN_ERROR_KINDS.FORBIDDEN });
  });

  it('answers a missing row with 404 DOCUMENT_NOT_FOUND', async () => {
    await expect(
      build().get(ACTOR, 'x', 'id', 'published'),
    ).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
      errorCode: 'DOCUMENT_NOT_FOUND',
      message: DOCUMENT_ERROR_MESSAGES.NOT_FOUND,
    });
  });
});
