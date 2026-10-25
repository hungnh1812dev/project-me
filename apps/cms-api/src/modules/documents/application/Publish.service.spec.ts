import { DOMAIN_ERROR_KINDS } from '../../../common/errors/DomainErrorKinds.constants';
import type { ActorContext, RolePolicy } from '../../access';
import { DOCUMENT_ERROR_CODES } from '../domain/Documents.constants';
import { PublishService } from './Publish.service';

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
const SLUG = 'article';
const DOC = 'doc-1';
const UNIT = { afterCommit: () => undefined };

interface Fakes {
  draftVersion?: number;
  hasDraftAndPublish?: boolean;
  isContentType?: boolean;
  activityFails?: boolean;
}

function build(fakes: Fakes = {}) {
  const draftVersion = fakes.draftVersion ?? 3;
  const documents = {
    lockRow: jest.fn((_unit, _type, selector: { status: string }) =>
      Promise.resolve(
        selector.status === 'draft'
          ? { id: 1, version: draftVersion }
          : undefined,
      ),
    ),
    loadTrees: jest.fn(() =>
      Promise.resolve([
        { values: {}, components: {}, createdBy: 2, documentId: DOC },
      ]),
    ),
    lockRowIds: jest.fn(() => Promise.resolve([] as number[])),
    deleteRows: jest.fn(() => Promise.resolve(1)),
    insertTree: jest.fn(() => Promise.resolve(9)),
    setVersionAndEditor: jest.fn(() => Promise.resolve()),
  };
  const logger = { warn: jest.fn(), error: jest.fn() };
  const activity = {
    record: jest.fn(() =>
      fakes.activityFails
        ? Promise.reject(new Error('down'))
        : Promise.resolve(),
    ),
  };
  const service = new PublishService(
    {
      policy: () =>
        Promise.resolve({
          catalog: { isContentType: () => fakes.isContentType ?? true },
          evaluator: { rowFilter: () => ({ allowed: true, where: null }) },
        }),
    } as never,
    {
      registry: () =>
        Promise.resolve({
          resolve: () => ({
            definition: { draftAndPublish: fakes.hasDraftAndPublish ?? true },
            root: { plan: { name: SLUG } },
          }),
        }),
    } as never,
    { run: (work: (unit: unknown) => Promise<unknown>) => work(UNIT) } as never,
    documents as never,
    activity,
    logger,
    { now: () => NOW_MS },
  );
  return { service, documents, logger, activity };
}

describe('PublishService', () => {
  it('publishes a copy of the draft stamped by the clock and returns the draft version', async () => {
    const { service, documents } = build();
    await expect(service.publish(ACTOR, SLUG, DOC, 3)).resolves.toEqual({
      documentId: DOC,
      version: 3,
    });
    expect(documents.insertTree).toHaveBeenCalledWith(
      UNIT,
      SLUG,
      expect.objectContaining({ publishedAt: new Date(NOW_MS) }),
    );
  });

  it('refuses a stale expected version with a conflict that names the current one', async () => {
    const { service } = build({ draftVersion: 4 });
    await expect(service.publish(ACTOR, SLUG, DOC, 3)).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.CONFLICT,
      errorCode: DOCUMENT_ERROR_CODES.VERSION_CONFLICT,
      details: { currentVersion: 4 },
    });
  });

  it('refuses an anonymous actor, an unknown type and a type without draft and publish', async () => {
    await expect(
      build().service.publish({ kind: 'anonymous', role: ROLE }, SLUG, DOC, 1),
    ).rejects.toMatchObject({ kind: DOMAIN_ERROR_KINDS.FORBIDDEN });
    await expect(
      build({ isContentType: false }).service.publish(ACTOR, SLUG, DOC, 1),
    ).rejects.toMatchObject({ kind: DOMAIN_ERROR_KINDS.NOT_FOUND });
    await expect(
      build({ hasDraftAndPublish: false }).service.publish(ACTOR, SLUG, DOC, 1),
    ).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.INVALID_INPUT,
      errorCode: DOCUMENT_ERROR_CODES.NOT_PUBLISHABLE,
    });
  });

  it('is a 404 when a delete reaches no row', async () => {
    const { service } = build();
    await expect(service.remove(ACTOR, SLUG, DOC)).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
      errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
    });
  });

  it('logs a failed activity record through AppLogger and still succeeds', async () => {
    const { service, logger } = build({ activityFails: true });
    await expect(service.publish(ACTOR, SLUG, DOC, 3)).resolves.toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('activity tracking failed for publish article'),
      PublishService.name,
    );
  });
});
