import type { ActorContext, RolePolicy } from '../../access';
import { DocumentNotFoundError } from '../../content-engine';
import { DOCUMENT_ERROR_CODES } from '../domain/Documents.constants';
import { DocumentsCommandService } from './DocumentsCommand.service';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/Domain.errors';

const ROLE: RolePolicy = {
  id: 1,
  slug: 'editor',
  rank: 10,
  isSystem: false,
  policyVersion: 1,
  permissions: [],
};
const ACTOR: ActorContext = { kind: 'account', accountId: 7, role: ROLE };
const NOW_MS = 1_700_000_000_000;
const UNIT = { afterCommit: () => undefined };
const SLUG = 'article';
const DOC = 'doc-1';

interface Fakes {
  canCreate?: boolean;
  isRowBumped?: boolean;
  hasDraftAndPublish?: boolean;
  replaceTree?: () => Promise<number>;
}

function build(fakes: Fakes = {}) {
  const documents = {
    insertTree: jest.fn(() => Promise.resolve(5)),
    bumpVersion: jest.fn(() =>
      Promise.resolve(fakes.isRowBumped === false ? undefined : { id: 5 }),
    ),
    replaceTree: jest.fn(fakes.replaceTree ?? (() => Promise.resolve(5))),
    findVersion: jest.fn(() => Promise.resolve(undefined)),
    findOne: jest.fn(() => Promise.resolve(undefined)),
  };
  const type = {
    definition: { draftAndPublish: fakes.hasDraftAndPublish ?? true },
    root: {
      plan: { name: SLUG },
      columnsByField: new Map(),
      components: [],
    },
  };
  const evaluator = {
    can: () => fakes.canCreate ?? true,
    rowFilter: () => ({ allowed: true, where: null }),
    fieldsFor: () => ({
      readable: { kind: 'all' },
      writable: { kind: 'all' },
    }),
    canReadDrafts: () => true,
  };
  const service = new DocumentsCommandService(
    {
      policy: () =>
        Promise.resolve({
          catalog: { isContentType: () => true },
          evaluator,
        }),
    } as never,
    { registry: () => Promise.resolve({ resolve: () => type }) } as never,
    { run: (work: (unit: unknown) => Promise<unknown>) => work(UNIT) } as never,
    documents as never,
    {
      toStored: (_actor: unknown, _root: unknown, tree: unknown) =>
        Promise.resolve(tree),
      embed: () => Promise.resolve(),
    } as never,
    { now: () => NOW_MS },
  );
  return { service, documents };
}

describe('DocumentsCommandService', () => {
  it('refuses a reviewer and an actor without create permission', async () => {
    await expect(
      build().service.create(
        { kind: 'reviewer', accountId: 1, sessionId: 1, role: ROLE },
        SLUG,
        {},
      ),
    ).rejects.toMatchObject({ kind: DOMAIN_ERROR_KINDS.FORBIDDEN });
    await expect(
      build({ canCreate: false }).service.create(ACTOR, SLUG, {}),
    ).rejects.toMatchObject({ kind: DOMAIN_ERROR_KINDS.FORBIDDEN });
  });

  it('stamps a live row of a type without draft and publish with the clock', async () => {
    const { service, documents } = build({ hasDraftAndPublish: false });
    await service.create(ACTOR, SLUG, {});
    expect(documents.insertTree).toHaveBeenCalledWith(
      UNIT,
      SLUG,
      expect.objectContaining({ publishedAt: new Date(NOW_MS) }),
    );
  });

  it('answers 404 DOCUMENT_NOT_FOUND when the row vanishes before it is locked', async () => {
    const { service } = build({
      replaceTree: () =>
        Promise.reject(
          new DocumentNotFoundError(SLUG, {
            documentId: DOC,
            status: 'draft',
          }),
        ),
    });
    await expect(service.update(ACTOR, SLUG, DOC, 1, {})).rejects.toMatchObject(
      {
        kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
        errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
      },
    );
  });

  it('answers 404 when no row matches the version and the row is gone', async () => {
    await expect(
      build({ isRowBumped: false }).service.update(ACTOR, SLUG, DOC, 1, {}),
    ).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
      errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
    });
  });
});
