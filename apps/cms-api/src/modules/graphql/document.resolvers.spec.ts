import { NotFoundException } from '@nestjs/common';
import { execute, parse } from 'graphql';

import type { ActorContext } from '../access/actor-context';
import type { DocumentsQueryService } from '../documents/documents.query.service';
import { attachDocumentResolvers } from './document.resolvers';
import { buildGraphqlSchema } from './schema/schema.builder';

const actor = { kind: 'anonymous' } as unknown as ActorContext;
const ID = '0190a4f0-0000-7000-8000-000000000001';
const record = {
  documentId: ID,
  version: 1,
  values: { title: 'A' },
  components: {},
  _maskedFields: [],
};

function setup() {
  const documents = {
    list: jest.fn(() =>
      Promise.resolve({
        data: [record],
        meta: { page: 1, pageSize: 20, total: 1 },
      }),
    ),
    get: jest.fn(() => Promise.resolve(record)),
  };
  const schema = attachDocumentResolvers(
    buildGraphqlSchema([
      {
        slug: 'article',
        kind: 'collection',
        draftAndPublish: true,
        fields: [{ name: 'title', type: 'string' }],
      },
      {
        slug: 'home',
        kind: 'single',
        draftAndPublish: true,
        fields: [{ name: 'title', type: 'string' }],
      },
    ]),
    documents as unknown as DocumentsQueryService,
  );
  const run = (query: string) =>
    execute({ schema, document: parse(query), contextValue: { actor } });
  return { documents, run };
}

describe('document resolvers', () => {
  it('list calls the service with the REST query and the default sort', async () => {
    const { documents, run } = setup();
    const result = await run(
      '{ articleList { data { title } meta { total } } }',
    );
    expect(result).toEqual({
      data: { articleList: { data: [{ title: 'A' }], meta: { total: 1 } } },
    });
    expect(documents.list).toHaveBeenCalledWith(actor, 'article', {
      status: 'published',
      page: 1,
      pageSize: 20,
      sort: [{ path: 'updatedAt', direction: 'desc' }],
      filters: [],
    });
  });

  it('a single type resolves through list with pageSize 1', async () => {
    const { documents, run } = setup();
    expect(await run('{ home(status: DRAFT) { title } }')).toEqual({
      data: { home: { title: 'A' } },
    });
    expect(documents.list).toHaveBeenCalledWith(
      actor,
      'home',
      expect.objectContaining({
        status: 'draft',
        page: 1,
        pageSize: 1,
        filters: [],
      }),
    );
  });

  it('the item field calls get, and a not-found document is null without error', async () => {
    const { documents, run } = setup();
    expect(await run(`{ article(documentId: "${ID}") { title } }`)).toEqual({
      data: { article: { title: 'A' } },
    });
    expect(documents.get).toHaveBeenCalledWith(
      actor,
      'article',
      ID,
      'published',
    );
    documents.get.mockRejectedValueOnce(
      new NotFoundException({ errorCode: 'DOCUMENT_NOT_FOUND' }),
    );
    expect(await run(`{ article(documentId: "${ID}") { title } }`)).toEqual({
      data: { article: null },
    });
  });

  it('other service errors stay errors on that root field only', async () => {
    const { documents, run } = setup();
    documents.get.mockRejectedValueOnce(new NotFoundException());
    const result = await run(
      `{ article(documentId: "${ID}") { title } home { title } }`,
    );
    expect(result.data).toEqual({ article: null, home: { title: 'A' } });
    expect(result.errors).toHaveLength(1);
  });
});
