import { DOMAIN_ERROR_KINDS } from '../../../common/errors/Domain.errors';
import { FieldSelection, type ActorContext, type RolePolicy } from '../../access';
import { DOCUMENT_ERROR_CODES } from '../domain/Documents.constants';
import { DiscardService } from './Discard.service';
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
const SLUG = 'article';
const DOC = 'doc-1';
const UNIT = { afterCommit: () => undefined };
const PUBLISHED_TREE = { values: { title: 'A' }, components: {}, createdBy: 2, documentId: DOC };

interface Fakes {
  draftVersion?: number;
  publishedVersion?: number | null;
  hasDraft?: boolean;
  allowed?: boolean;
  writable?: FieldSelection;
  publishedInScope?: boolean;
  hasDraftAndPublish?: boolean;
  activityFails?: boolean;
}

function build(fakes: Fakes = {}) {
  const draftVersion = fakes.draftVersion ?? 3;
  const publishedVersion = fakes.publishedVersion === undefined ? 2 : fakes.publishedVersion;
  const calls: string[] = [];
  const documents = {
    lockRow: jest.fn((_unit, _type, selector: { status: string }) => {
      calls.push(`lock ${selector.status}`);
      if (selector.status === 'draft') {
        return Promise.resolve(
          fakes.hasDraft === false ? undefined : { id: 1, version: draftVersion },
        );
      }
      return Promise.resolve(
        publishedVersion === null ? undefined : { id: 2, version: publishedVersion },
      );
    }),
    isRowInScope: jest.fn(() => Promise.resolve(fakes.publishedInScope ?? true)),
    loadTrees: jest.fn(() => Promise.resolve([PUBLISHED_TREE])),
    replaceTree: jest.fn(() => Promise.resolve(1)),
    setVersionAndEditor: jest.fn((_unit, _type, rowId: number) => {
      calls.push(`version ${rowId}`);
      return Promise.resolve();
    }),
  };
  const activity = {
    record: jest.fn(() =>
      fakes.activityFails ? Promise.reject(new Error('down')) : Promise.resolve(),
    ),
  };
  const access = {
    policy: () =>
      Promise.resolve({
        catalog: { isContentType: () => true },
        evaluator: {
          rowFilter: () =>
            fakes.allowed === false
              ? { allowed: false }
              : {
                  allowed: true,
                  where: fakes.publishedInScope === undefined ? null : ({} as never),
                },
          fieldsFor: () => ({
            readable: FieldSelection.ALL,
            writable: fakes.writable ?? FieldSelection.ALL,
          }),
        },
      }),
  };
  const transactions = { run: (work: (unit: unknown) => Promise<unknown>) => work(UNIT) };
  const publishing = new PublishService(
    access as never,
    {
      registry: () =>
        Promise.resolve({
          resolve: () => ({
            slug: SLUG,
            definition: {
              draftAndPublish: fakes.hasDraftAndPublish ?? true,
              fields: [{ name: 'title' }, { name: 'body' }],
            },
          }),
        }),
    } as never,
    transactions as never,
    documents as never,
    activity,
    { warn: jest.fn(), error: jest.fn() },
    { now: () => 0 },
  );
  const service = new DiscardService(
    access as never,
    publishing,
    transactions as never,
    documents as never,
  );
  return { service, documents, activity, calls };
}

describe('DiscardService', () => {
  it('copies the published tree into the draft and gives both rows the next version', async () => {
    const { service, documents, calls } = build();
    await expect(service.discard(ACTOR, SLUG, DOC, 3)).resolves.toEqual({
      documentId: DOC,
      version: 4,
    });
    expect(documents.replaceTree).toHaveBeenCalledWith(
      UNIT,
      SLUG,
      { documentId: DOC, status: 'draft' },
      expect.objectContaining({
        values: { title: 'A' },
        updatedBy: 7,
        restoreComponentUids: true,
      }),
    );
    expect(documents.setVersionAndEditor).toHaveBeenCalledWith(UNIT, expect.anything(), 1, {
      version: 4,
      updatedBy: 7,
    });
    expect(documents.setVersionAndEditor).toHaveBeenCalledWith(UNIT, expect.anything(), 2, {
      version: 4,
      updatedBy: 7,
    });
    expect(calls.slice(0, 2)).toEqual(['lock draft', 'lock published']);
  });

  it('is 403 for anonymous, a reviewer and an actor without update', async () => {
    await expect(
      build().service.discard({ kind: 'anonymous', role: ROLE }, SLUG, DOC, 3),
    ).rejects.toMatchObject({ kind: DOMAIN_ERROR_KINDS.FORBIDDEN });
    await expect(
      build().service.discard({ kind: 'reviewer', role: ROLE } as never, SLUG, DOC, 3),
    ).rejects.toMatchObject({ kind: DOMAIN_ERROR_KINDS.FORBIDDEN });
    await expect(
      build({ allowed: false }).service.discard(ACTOR, SLUG, DOC, 3),
    ).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.FORBIDDEN,
    });
  });

  it('is 400 DOCUMENT_NOT_PUBLISHABLE for a type without draft and publish', async () => {
    await expect(
      build({ hasDraftAndPublish: false }).service.discard(ACTOR, SLUG, DOC, 3),
    ).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.INVALID_INPUT,
      errorCode: DOCUMENT_ERROR_CODES.NOT_PUBLISHABLE,
    });
  });

  it('is 403 before any row is read when a root field is not writable', async () => {
    const { service, documents } = build({ writable: FieldSelection.of(['title']) });
    await expect(service.discard(ACTOR, SLUG, DOC, 3)).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.FORBIDDEN,
    });
    expect(documents.lockRow).not.toHaveBeenCalled();
  });

  it('is 404 when the draft row is missing or outside the conditions', async () => {
    await expect(
      build({ hasDraft: false }).service.discard(ACTOR, SLUG, DOC, 3),
    ).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
    });
  });

  it('is a 409 conflict naming the current version for a stale expected version', async () => {
    const { service, documents } = build({ draftVersion: 5 });
    await expect(service.discard(ACTOR, SLUG, DOC, 3)).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.CONFLICT,
      errorCode: DOCUMENT_ERROR_CODES.VERSION_CONFLICT,
      details: { currentVersion: 5 },
    });
    expect(documents.replaceTree).not.toHaveBeenCalled();
  });

  it('is 409 DOCUMENT_NOT_MODIFIED without a published row or with equal versions', async () => {
    for (const fakes of [{ publishedVersion: null }, { publishedVersion: 3 }]) {
      const { service, documents } = build(fakes);
      await expect(service.discard(ACTOR, SLUG, DOC, 3)).rejects.toMatchObject({
        kind: DOMAIN_ERROR_KINDS.CONFLICT,
        errorCode: DOCUMENT_ERROR_CODES.NOT_MODIFIED,
      });
      expect(documents.replaceTree).not.toHaveBeenCalled();
    }
  });

  it('is 404 when the published row is outside the actor conditions', async () => {
    const { service, documents } = build({ publishedInScope: false });
    await expect(service.discard(ACTOR, SLUG, DOC, 3)).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
    });
    expect(documents.replaceTree).not.toHaveBeenCalled();
  });

  it('records the activity only after commit and never fails on a recorder error', async () => {
    const failing = build({ activityFails: true });
    await expect(failing.service.discard(ACTOR, SLUG, DOC, 3)).resolves.toBeDefined();
    const refused = build({ draftVersion: 5 });
    await expect(refused.service.discard(ACTOR, SLUG, DOC, 3)).rejects.toBeDefined();
    expect(refused.activity.record).not.toHaveBeenCalled();
    const ok = build();
    await ok.service.discard(ACTOR, SLUG, DOC, 3);
    expect(ok.activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'discard', subject: SLUG, documentId: DOC, version: 4 }),
    );
  });
});
