import { BadRequestException } from '@nestjs/common';
import {
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { DummyDriver, Kysely } from 'kysely';

import { ARTICLE_DEFINITION } from '../../../test/fixtures/access.fixture';
import { RegistryService } from '../content-engine/registry.service';
import {
  coerceFilterValue,
  filterExpression,
  queryColumnOf,
} from './document-filter';

const type = RegistryService.fromDefinitions([ARTICLE_DEFINITION]).resolve(
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
    expect(() => queryColumnOf(type, path)).toThrow(BadRequestException);
  });
});

describe('coerceFilterValue', () => {
  it.each([
    ['integer', '42', 42],
    ['integer', '-7', -7],
    ['decimal', '1.50', '1.50'],
    ['boolean', 'true', true],
    ['boolean', 'false', false],
    ['date', '2026-02-28', '2026-02-28'],
    ['datetime', '2026-03-01T10:00:00+07:00', '2026-03-01T03:00:00.000Z'],
    ['datetime', '2026-03-01', '2026-03-01T00:00:00.000Z'],
    [
      'uuid',
      '0A0A0A0A-0A0A-4A0A-8A0A-0A0A0A0A0A0A',
      '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a',
    ],
    ['string', 'anything', 'anything'],
  ] as const)('%s %s', (kind, raw, expected) => {
    expect(coerceFilterValue(kind, raw)).toBe(expected);
  });

  it.each([
    ['integer', '1.5'],
    ['integer', '2147483648'],
    ['integer', '1e3'],
    ['decimal', '1,5'],
    ['decimal', 'NaN'],
    ['boolean', '1'],
    ['boolean', 'TRUE'],
    ['date', '2026-02-31'],
    ['date', '0000-01-01'],
    ['date', '2026-2-1'],
    ['datetime', 'yesterday'],
    ['datetime', '2026-03-01T10:00:00'],
    ['datetime', '0000-01-01T00:00:00Z'],
    ['uuid', 'not-a-uuid'],
  ] as const)('refuses %s %s', (kind, raw) => {
    expect(coerceFilterValue(kind, raw)).toBeUndefined();
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
    expect(() => compile('priority', 'contains', ['1'])).toThrow(
      BadRequestException,
    );
    expect(() => compile('featured', 'gt', ['true'])).toThrow(
      BadRequestException,
    );
    expect(() => compile('title', 'gt', ['a'])).toThrow(BadRequestException);
  });

  it('refuses a value of the wrong type', () => {
    expect(() => compile('priority', 'eq', ['abc'])).toThrow(
      BadRequestException,
    );
    expect(() => compile('priority', 'in', ['1', 'x'])).toThrow(
      BadRequestException,
    );
  });
});
