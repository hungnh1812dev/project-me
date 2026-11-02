import { profileType, rawRecord } from '../../../../test/fixtures/Masking.fixture';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/Domain.errors';
import { FieldSelection, type ActorContext, type RolePolicy } from '../../access';
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
const TYPE = profileType();
const ACTOR: ActorContext = { kind: 'account', accountId: 7, role: ROLE };

interface Fakes {
  isContentType?: boolean;
  canReadDrafts?: boolean;
  isReadAllowed?: boolean;
  isDraftAndPublish?: boolean;
  /** Row `findOne` and `list` return. */
  row?: { version: number; publishedAt: Date | null; counterpartVersion: number | null };
}

function build(fakes: Fakes = {}) {
  const storedRow = () => fakes.row && { ...rawRecord(TYPE, 2).record, ...fakes.row };
  const evaluator = {
    canReadDrafts: () => fakes.canReadDrafts ?? true,
    rowFilter: () => ({ allowed: fakes.isReadAllowed ?? true, where: null }),
    fieldsFor: () => ({ readable: FieldSelection.ALL }),
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
          resolve: () => ({
            ...TYPE,
            definition: { ...TYPE.definition, draftAndPublish: fakes.isDraftAndPublish ?? true },
          }),
        }),
    } as never,
    {
      findOne: () => Promise.resolve(storedRow()),
      list: () =>
        Promise.resolve({
          documents: fakes.row ? [storedRow()] : [],
          total: 1,
        }),
    } as never,
    { embed: () => Promise.resolve() } as never,
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
    await expect(build().get(ACTOR, 'x', 'id', 'published')).rejects.toMatchObject({
      kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
      errorCode: 'DOCUMENT_NOT_FOUND',
      message: DOCUMENT_ERROR_MESSAGES.NOT_FOUND,
    });
  });
});

describe('DocumentsQueryService publishState (SPEC §16.2)', () => {
  const LIST_QUERY = {
    status: 'draft',
    filters: [],
    sort: [],
    page: 1,
    pageSize: 10,
  } as never;
  const DRAFT_ROW = { version: 4, publishedAt: null, counterpartVersion: 3 };
  const PUBLISHED_ROW = { version: 3, publishedAt: new Date(), counterpartVersion: 4 };

  it('marks a draft row with a different published version as modified', async () => {
    const record = await build({ row: DRAFT_ROW }).get(ACTOR, 'x', 'id', 'draft');
    expect(record.publishState).toBe('modified');
  });

  it('marks equal versions as published, on either row', async () => {
    const equal = { ...DRAFT_ROW, counterpartVersion: 4 };
    expect((await build({ row: equal }).get(ACTOR, 'x', 'id', 'draft')).publishState).toBe(
      'published',
    );
    const publishedSide = { ...PUBLISHED_ROW, version: 4 };
    expect(
      (await build({ row: publishedSide }).get(ACTOR, 'x', 'id', 'published')).publishState,
    ).toBe('published');
  });

  it('marks a draft without a published row as draft', async () => {
    const row = { ...DRAFT_ROW, counterpartVersion: null };
    expect((await build({ row }).get(ACTOR, 'x', 'id', 'draft')).publishState).toBe('draft');
  });

  it('reads the state of the published row too', async () => {
    const record = await build({ row: PUBLISHED_ROW }).get(ACTOR, 'x', 'id', 'published');
    expect(record.publishState).toBe('modified');
  });

  it('adds the state to every list item', async () => {
    const page = await build({ row: DRAFT_ROW }).list(ACTOR, 'x', LIST_QUERY);
    expect(page.data.map((record) => record.publishState)).toEqual(['modified']);
  });

  it('leaves the key out for an actor who may not read drafts', async () => {
    const record = await build({ row: PUBLISHED_ROW, canReadDrafts: false }).get(
      ACTOR,
      'x',
      'id',
      'published',
    );
    expect('publishState' in record).toBe(false);
  });

  it('leaves the key out for a type without draft and publish', async () => {
    const record = await build({ row: DRAFT_ROW, isDraftAndPublish: false }).get(
      ACTOR,
      'x',
      'id',
      'draft',
    );
    expect('publishState' in record).toBe(false);
  });
});
