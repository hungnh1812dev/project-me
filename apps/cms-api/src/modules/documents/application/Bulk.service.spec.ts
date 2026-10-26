import type { ActorContext, RolePolicy } from '../../access';
import {
  BULK_ITEM_STATUS,
  BULK_LIMITS,
  DOCUMENT_ERROR_CODES,
} from '../domain/Documents.constants';
import {
  DomainError,
  DOMAIN_ERROR_KINDS,
} from '../../../common/errors/Domain.errors';
import { BulkService } from './Bulk.service';

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
const UNIT = { afterCommit: () => undefined };
const ID_A = 'a';
const ID_B = 'b';

function build(kind: 'collection' | 'single' = 'collection') {
  const runInSavepoint = jest.fn(
    (_unit: unknown, work: (unit: unknown) => Promise<unknown>) => work(UNIT),
  );
  const publishing = {
    begin: jest.fn(() => Promise.resolve({ type: {}, rowCondition: null })),
    publishIn: jest.fn((_unit, _scope, _slug, documentId: string) =>
      documentId === ID_A
        ? Promise.reject(
            new DomainError({
              kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
              errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
              message: 'Document not found.',
            }),
          )
        : Promise.resolve(2),
    ),
    track: jest.fn(() => Promise.resolve()),
  };
  const service = new BulkService(
    {
      policy: () =>
        Promise.resolve({
          catalog: { isContentType: () => true },
          evaluator: { can: () => true },
        }),
    } as never,
    {
      registry: () =>
        Promise.resolve({ resolve: () => ({ definition: { kind } }) }),
    } as never,
    {
      run: (work: (unit: unknown) => Promise<unknown>) => work(UNIT),
      runInSavepoint,
    } as never,
    {} as never,
    {} as never,
    publishing as never,
    { now: () => 0 },
  );
  return { service, runInSavepoint, publishing };
}

const publishItems = (atomic: boolean) => ({
  atomic,
  items: [
    { documentId: ID_A, expectedVersion: 1 },
    { documentId: ID_B, expectedVersion: 1 },
  ],
});

describe('BulkService', () => {
  it('refuses a single type', async () => {
    await expect(
      build('single').service.publish(ACTOR, SLUG, publishItems(false)),
    ).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.INVALID_INPUT,
      errorCode: DOCUMENT_ERROR_CODES.BULK_NOT_COLLECTION,
    });
  });

  it('non-atomic: one savepoint per item, an item error does not stop the rest', async () => {
    const { service, runInSavepoint, publishing } = build();
    const response = await service.publish(ACTOR, SLUG, publishItems(false));
    expect(runInSavepoint).toHaveBeenCalledTimes(2);
    expect(response).toMatchObject({ atomic: false, succeeded: 1, failed: 1 });
    expect(response.results[0]).toMatchObject({
      index: 0,
      status: BULK_ITEM_STATUS.ERROR,
      statusCode: 404,
      errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
    });
    expect(publishing.track).toHaveBeenCalledTimes(1);
  });

  it('atomic: the first failing item aborts with its index', async () => {
    const { service, runInSavepoint } = build();
    const failure: unknown = await service
      .publish(ACTOR, SLUG, publishItems(true))
      .catch((error: unknown) => error);
    expect(runInSavepoint).not.toHaveBeenCalled();
    expect(failure).toMatchObject({
      kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
      errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
      details: { index: 0 },
    });
  });

  it('refuses a create item over the component row limit before any write', async () => {
    const rows = Array.from(
      { length: BULK_LIMITS.MAX_COMPONENT_ROWS_PER_ITEM + 1 },
      () => ({}),
    );
    const { service } = build();
    await expect(
      service.create(ACTOR, SLUG, {
        atomic: true,
        items: [{ components: { rows } }],
      }),
    ).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.INVALID_INPUT,
      details: { index: 0 },
    });
  });
});
