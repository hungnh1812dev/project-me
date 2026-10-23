import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  execute,
  GraphQLList,
  GraphQLNonNull,
  type GraphQLObjectType,
  type GraphQLSchema,
  parse,
  printSchema,
  validate,
} from 'graphql';

import type { ContentTypeDefinition } from '../../content-engine';
import { DEFAULT_CONTENT_PATHS } from '../../content-engine';
import { loadDefinitions } from '../../content-engine';
import {
  GRAPHQL_SDL_FILE_NAME,
  ROOT_FIELD_EXTENSION_KEY,
} from '../graphql.constants';
import { buildGraphqlSchema, GraphqlSchemaError } from './schema.builder';
import { GraphqlNameClashError } from './type-names';

const ALL_TYPES: ContentTypeDefinition = {
  slug: 'all-types',
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    { name: 'title', type: 'string' },
    { name: 'body', type: 'text' },
    { name: 'summary', type: 'richtext' },
    { name: 'count', type: 'integer' },
    { name: 'price', type: 'decimal' },
    { name: 'active', type: 'boolean' },
    { name: 'day', type: 'date' },
    { name: 'moment', type: 'datetime' },
    { name: 'extra', type: 'json' },
    { name: 'cover', type: 'media' },
    {
      name: 'items',
      type: 'component',
      repeatable: true,
      fields: [
        { name: 'label', type: 'string' },
        {
          name: 'inner',
          type: 'component',
          fields: [{ name: 'note', type: 'string' }],
        },
      ],
    },
    {
      name: 'seo',
      type: 'component',
      fields: [{ name: 'team_size', type: 'integer' }],
    },
  ],
};

const SETTINGS: ContentTypeDefinition = {
  slug: 'site-settings',
  kind: 'single',
  draftAndPublish: false,
  fields: [{ name: 'siteName', type: 'string' }],
};

const sdl = (schema: GraphQLSchema) => printSchema(schema);

function objectType(schema: GraphQLSchema, name: string): GraphQLObjectType {
  const type = schema.getType(name);
  if (type === undefined || !('getFields' in type)) {
    throw new Error(`No object type ${name}`);
  }
  return type as GraphQLObjectType;
}

describe('buildGraphqlSchema', () => {
  const schema = buildGraphqlSchema([ALL_TYPES, SETTINGS]);

  it('matches the committed SDL for the real content definitions', async () => {
    const definitions = await loadDefinitions(DEFAULT_CONTENT_PATHS.schemasDir);
    const committed = readFileSync(
      join(DEFAULT_CONTENT_PATHS.schemasDir, '..', GRAPHQL_SDL_FILE_NAME),
      'utf8',
    );
    expect(`${printSchema(buildGraphqlSchema(definitions))}\n`).toBe(committed);
  });

  it('is the same schema whatever the order of the definitions', () => {
    expect(sdl(buildGraphqlSchema([SETTINGS, ALL_TYPES]))).toBe(sdl(schema));
  });

  it('maps every field type as in the design', () => {
    const fields = objectType(schema, 'AllTypes').getFields();
    const printed = (name: string) => String(fields[name]?.type);
    expect(printed('title')).toBe('String');
    expect(printed('body')).toBe('String');
    expect(printed('summary')).toBe('String');
    expect(printed('count')).toBe('Int');
    expect(printed('price')).toBe('Decimal');
    expect(printed('active')).toBe('Boolean');
    expect(printed('day')).toBe('Date');
    expect(printed('moment')).toBe('DateTime');
    expect(printed('extra')).toBe('JSON');
    expect(printed('cover')).toBe('Media');
  });

  it('keeps every content field nullable and the system fields typed', () => {
    const fields = objectType(schema, 'AllTypes').getFields();
    for (const name of ['title', 'count', 'cover', 'items', 'seo']) {
      expect(fields[name]?.type).not.toBeInstanceOf(GraphQLNonNull);
    }
    const printed = (name: string) => String(fields[name]?.type);
    expect(printed('documentId')).toBe('ID!');
    expect(printed('version')).toBe('Int!');
    expect(printed('publishedAt')).toBe('DateTime');
    expect(printed('createdAt')).toBe('DateTime!');
    expect(printed('createdBy')).toBe('Int');
    expect(printed('_maskedFields')).toBe('[String!]!');
  });

  it('makes a repeatable component a nullable list and a single one an object', () => {
    const fields = objectType(schema, 'AllTypes').getFields();
    expect(String(fields.items?.type)).toBe('[AllTypes_Items!]');
    expect(fields.items?.type).toBeInstanceOf(GraphQLList);
    expect(String(fields.seo?.type)).toBe('AllTypes_Seo');
  });

  it('names nested component types by their path and adds componentUid', () => {
    const items = objectType(schema, 'AllTypes_Items').getFields();
    expect(String(items.componentUid?.type)).toBe('ID!');
    expect(String(items.inner?.type)).toBe('AllTypes_Items_Inner');
    expect(
      objectType(schema, 'AllTypes_Items_Inner').getFields().note,
    ).toBeDefined();
    expect(
      objectType(schema, 'AllTypes_Seo').getFields().team_size,
    ).toBeDefined();
  });

  it('gives a collection an item field and a list field', () => {
    const query = objectType(schema, 'Query').getFields();
    expect(query.allTypes?.args.map((arg) => arg.name)).toEqual([
      'documentId',
      'status',
    ]);
    expect(query.allTypesList?.args.map((arg) => arg.name)).toEqual([
      'status',
      'page',
      'pageSize',
      'sort',
      'filter',
    ]);
    expect(String(query.allTypesList?.type)).toBe('AllTypesPage');
    expect(
      query.allTypesList?.args.find((a) => a.name === 'page')?.defaultValue,
    ).toBe(1);
    expect(
      query.allTypesList?.args.find((a) => a.name === 'pageSize')?.defaultValue,
    ).toBe(20);
  });

  it('gives a single type only the item field', () => {
    const query = objectType(schema, 'Query').getFields();
    expect(query.siteSettings?.args.map((arg) => arg.name)).toEqual(['status']);
    expect(query.siteSettingsList).toBeUndefined();
    expect(schema.getType('SiteSettingsPage')).toBeUndefined();
    expect(schema.getType('SiteSettingsFilter')).toBeUndefined();
    expect(schema.getType('SiteSettingsSort')).toBeUndefined();
  });

  it('tells the resolvers (GQ2) which content type and read each root field is', () => {
    const fields = objectType(schema, 'Query').getFields();
    const extension = (name: string) =>
      fields[name]?.extensions[ROOT_FIELD_EXTENSION_KEY];
    expect(extension('allTypes')).toEqual({
      slug: 'all-types',
      operation: 'item',
    });
    expect(extension('allTypesList')).toEqual({
      slug: 'all-types',
      operation: 'list',
    });
    expect(extension('siteSettings')).toEqual({
      slug: 'site-settings',
      operation: 'single',
    });
  });

  it('lets a list filter and sort on top-level scalars and system fields only', () => {
    const filter = schema.getType('AllTypesFilter');
    const entries = Object.fromEntries(
      Object.entries(
        (
          filter as { getFields(): Record<string, { type: unknown }> }
        ).getFields(),
      ).map(([name, field]) => [name, String(field.type)]),
    );
    expect(entries).toMatchObject({
      title: 'TextFilter',
      body: 'TextFilter',
      summary: 'TextFilter',
      count: 'IntFilter',
      price: 'DecimalFilter',
      active: 'BooleanFilter',
      day: 'DateFilter',
      moment: 'DateTimeFilter',
      documentId: 'IdFilter',
      version: 'IntFilter',
      updatedAt: 'DateTimeFilter',
      createdBy: 'IntFilter',
    });
    for (const excluded of ['extra', 'cover', 'items', 'seo']) {
      expect(entries).not.toHaveProperty(excluded);
    }
    const sortField = schema.getType('AllTypesSortField');
    expect(
      sortField && 'getValues' in sortField
        ? sortField.getValues().map((value) => value.name)
        : [],
    ).toEqual(Object.keys(entries));
  });

  it('exposes the draft and published status as DocumentStatus', () => {
    const arg = objectType(schema, 'Query').getFields().allTypes?.args[1];
    expect(String(arg?.type)).toBe('DocumentStatus');
    expect(arg?.defaultValue).toBe('published');
  });

  it('reads masked and absent values from the serialized record only', async () => {
    const record = {
      documentId: 'd1',
      version: 2,
      publishedAt: new Date('2026-01-02T03:04:05.000Z'),
      locale: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      values: { title: '***', count: null, day: '2026-03-04', price: '12.50' },
      components: {
        items: [
          {
            componentUid: 'c1',
            values: { label: 'one' },
            components: {
              inner: [
                { componentUid: 'c2', values: { note: 'n' }, components: {} },
              ],
            },
          },
        ],
        seo: null,
      },
      _maskedFields: ['seo', 'title'],
    };
    const document = parse(`{
      allTypesList { data {
        documentId version publishedAt createdBy _maskedFields
        title count day price extra
        items { componentUid label inner { note } }
        seo { team_size }
      } meta { total } }
    }`);
    expect(validate(schema, document)).toEqual([]);
    const result = await execute({
      schema,
      document,
      rootValue: {
        allTypesList: {
          data: [record],
          meta: { page: 1, pageSize: 20, total: 1 },
        },
      },
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      allTypesList: {
        data: [
          {
            documentId: 'd1',
            version: 2,
            publishedAt: '2026-01-02T03:04:05.000Z',
            createdBy: null,
            _maskedFields: ['seo', 'title'],
            title: '***',
            count: null,
            day: '2026-03-04',
            price: '12.50',
            extra: null,
            items: [{ componentUid: 'c1', label: 'one', inner: { note: 'n' } }],
            seo: null,
          },
        ],
        meta: { total: 1 },
      },
    });
  });

  it('resolves an empty non-repeatable component to null', async () => {
    const result = await execute({
      schema,
      document: parse('{ allTypes(documentId: "d1") { seo { team_size } } }'),
      rootValue: {
        allTypes: {
          values: {},
          components: { seo: [] },
        },
      },
    });
    expect(result).toEqual({ data: { allTypes: { seo: null } } });
  });

  it('serializes a media embed without any internal id', () => {
    const media = objectType(schema, 'Media').getFields();
    expect(Object.keys(media)).toEqual([
      'id',
      'fileName',
      'url',
      'thumbnailUrl',
      'provider',
      'alt',
      'size',
      'createdAt',
    ]);
    expect(String(objectType(schema, 'AllTypes').getFields().cover?.type)).toBe(
      'Media',
    );
  });

  describe('name clashes', () => {
    const type = (slug: string): ContentTypeDefinition => ({
      slug,
      kind: 'collection',
      draftAndPublish: false,
      fields: [{ name: 'title', type: 'string' }],
    });

    const clashMessage = (definitions: ContentTypeDefinition[]): string => {
      try {
        buildGraphqlSchema(definitions);
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    };

    it('rejects a slug whose generated type is another slug page type', () => {
      expect(() =>
        buildGraphqlSchema([type('cv-page'), type('cv-page-page')]),
      ).toThrow(GraphqlNameClashError);
    });

    it('names both sources of a clash and renames nothing', () => {
      const message = clashMessage([type('cv-page'), type('cv-page-page')]);
      expect(message).toContain('"CvPagePage"');
      expect(message).toContain('content type "cv-page"');
      expect(message).toContain('content type "cv-page-page"');
    });

    it('rejects two slugs that map to the same name', () => {
      expect(() =>
        buildGraphqlSchema([type('cv-page'), type('cv_page')]),
      ).toThrow(GraphqlNameClashError);
      expect(() => buildGraphqlSchema([type('a-b'), type('a-b')])).toThrow(
        GraphqlNameClashError,
      );
    });

    it('rejects a list field equal to another slug item field', () => {
      expect(() =>
        buildGraphqlSchema([type('post'), type('post-list')]),
      ).toThrow(/postList/);
    });

    it('rejects a slug equal to a shared type name', () => {
      expect(() => buildGraphqlSchema([type('media')])).toThrow(/"Media"/);
      expect(() => buildGraphqlSchema([type('page-meta')])).toThrow(
        /"PageMeta"/,
      );
      expect(() => buildGraphqlSchema([type('query')])).toThrow(/"Query"/);
    });

    it('rejects two component fields that map to the same type name', () => {
      const definition: ContentTypeDefinition = {
        slug: 'post',
        kind: 'collection',
        draftAndPublish: false,
        fields: [
          {
            name: 'teamSize',
            type: 'component',
            fields: [{ name: 'a', type: 'string' }],
          },
          {
            name: 'team_size',
            type: 'component',
            fields: [{ name: 'a', type: 'string' }],
          },
        ],
      };
      expect(() => buildGraphqlSchema([definition])).toThrow(/Post_TeamSize/);
    });
  });

  it('refuses to build a schema without content types', () => {
    expect(() => buildGraphqlSchema([])).toThrow(GraphqlSchemaError);
  });
});
