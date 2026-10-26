import { DomainError } from '../../../common/errors/Domain.errors';
import {
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { DummyDriver, Kysely } from 'kysely';

import { ARTICLE_DEFINITION } from '../../../../test/fixtures/Access.fixture';
import { ContentTypeRegistry } from '../../content-engine';
import {
  filterExpression,
  queryColumnOf,
  sortTarget,
} from './DocumentFilterSql.adapter';

const type = ContentTypeRegistry.fromDefinitions([ARTICLE_DEFINITION]).resolve(
  'article',
);

const db = new Kysely<Record<string, Record<string, unknown>>>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

function compile(
  path: string,
  op: Parameters<typeof filterExpression>[1]['op'],
  values: string[],
) {
  const expression = filterExpression(queryColumnOf(type, path), {
    path,
    op,
    values,
  });
  return db.selectFrom('t').selectAll().where(expression).compile();
}

describe('queryColumnOf', () => {
  it('maps system fields and top-level scalar fields to their columns', () => {
    expect(queryColumnOf(type, 'documentId')).toEqual({
      column: 'document_id',
      kind: 'uuid',
    });
    expect(queryColumnOf(type, 'updatedAt')).toEqual({
      column: 'updated_at',
      kind: 'datetime',
    });
    expect(queryColumnOf(type, 'priority')).toEqual({
      column: 'priority',
      kind: 'integer',
    });
    expect(queryColumnOf(type, 'releaseDate').kind).toBe('date');
  });

  it.each([
    'avatar',
    'meta',
    'reference',
    'reference.name',
    'nope',
    '__proto__',
    'constructor',
  ])('refuses %s', (path) => {
    expect(() => queryColumnOf(type, path)).toThrow(DomainError);
  });
});

describe('media fields', () => {
  const mediaType = ContentTypeRegistry.fromDefinitions([
    {
      slug: 'gallery',
      kind: 'collection',
      draftAndPublish: false,
      fields: [{ name: 'cover', type: 'media' }],
    },
  ]).resolve('gallery');

  it('refuses a media field as a filter target', () => {
    expect(() => queryColumnOf(mediaType, 'cover')).toThrow(DomainError);
  });

  it('refuses a media field as a sort key', () => {
    expect(() =>
      sortTarget(mediaType, { path: 'cover', direction: 'asc' }),
    ).toThrow(DomainError);
  });
});

describe('filterExpression', () => {
  it('binds every value as a parameter and quotes the column', () => {
    const query = compile('title', 'eq', ["x'; drop table t; --"]);
    expect(query.sql).toBe('select * from "t" where "title" = $1');
    expect(query.parameters).toEqual(["x'; drop table t; --"]);
  });

  it('builds in, ne, ordering and contains', () => {
    expect(compile('priority', 'in', ['1', '2']).sql).toContain(
      '"priority" in ($1, $2)',
    );
    expect(compile('priority', 'ne', ['1']).sql).toContain(
      '"priority" is distinct from $1',
    );
    expect(compile('priority', 'gte', ['1']).sql).toContain('"priority" >= $1');
    expect(compile('priority', 'lt', ['1']).sql).toContain('"priority" < $1');
  });

  it('escapes the LIKE wildcards of contains', () => {
    const query = compile('title', 'contains', ['50%_\\']);
    expect(query.sql).toContain('"title" ilike $1');
    expect(query.parameters).toEqual(['%50\\%\\_\\\\%']);
  });

  it('refuses an operator the field kind does not support', () => {
    expect(() => compile('priority', 'contains', ['1'])).toThrow(DomainError);
    expect(() => compile('featured', 'gt', ['true'])).toThrow(DomainError);
    expect(() => compile('title', 'gt', ['a'])).toThrow(DomainError);
  });

  it('refuses a value of the wrong type', () => {
    expect(() => compile('priority', 'eq', ['abc'])).toThrow(DomainError);
    expect(() => compile('priority', 'in', ['1', 'x'])).toThrow(DomainError);
  });
});
