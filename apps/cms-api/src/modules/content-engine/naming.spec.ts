import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ContentTypeDefinition } from './definition.schema';
import {
  componentTableName,
  planTables,
  relationNames,
  rootTableName,
  toSqlIdentifier,
} from './naming';

const CV_PAGE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'content',
  'schemas',
  'cv-page.json',
);

function loadCvPage(): ContentTypeDefinition {
  return JSON.parse(
    readFileSync(CV_PAGE_PATH, 'utf8'),
  ) as ContentTypeDefinition;
}

describe('naming', () => {
  it.each([
    ['teamSize', 'team_size'],
    ['repositoryLink', 'repository_link'],
    ['isMain', 'is_main'],
    ['address2Line', 'address2_line'],
    ['already_snake', 'already_snake'],
    ['plain', 'plain'],
  ])('maps field %s to column %s', (field, column) => {
    expect(toSqlIdentifier(field)).toBe(column);
  });

  it('maps a kebab slug to the root table name', () => {
    expect(rootTableName('cv-page')).toBe('cv_page');
  });

  it('joins component tables with a double underscore', () => {
    expect(
      componentTableName(componentTableName('cv_page', 'experience'), 'role'),
    ).toBe('cv_page__experience__role');
    expect(componentTableName('cv_page', 'workHistory')).toBe(
      'cv_page__work_history',
    );
  });

  it('composes relation names from the table name', () => {
    expect(relationNames.primaryKey('t')).toBe('t_pk');
    expect(relationNames.parentForeignKey('t')).toBe('t_parent_fk');
    expect(relationNames.parentOrderIndex('t')).toBe('t_parent_idx');
    expect(relationNames.draftUnique('t')).toBe('t_draft_uq');
    expect(relationNames.publishedUnique('t')).toBe('t_published_uq');
    expect(relationNames.publishedListIndex('t')).toBe('t_published_idx');
    expect(relationNames.mediaForeignKey('t', 'photo')).toBe(
      't_photo_media_fk',
    );
  });

  describe('planTables(cv-page)', () => {
    const tables = planTables(loadCvPage());

    it('produces the 8 tables of SPEC §8.2', () => {
      expect(tables.map((table) => table.name)).toEqual([
        'cv_page',
        'cv_page__skill',
        'cv_page__experience',
        'cv_page__experience__role',
        'cv_page__project',
        'cv_page__education',
        'cv_page__language',
        'cv_page__reference',
      ]);
    });

    it('links each component to its direct parent', () => {
      const role = tables.find(
        (table) => table.name === 'cv_page__experience__role',
      );
      expect(role).toMatchObject({
        kind: 'component',
        depth: 2,
        parentTable: 'cv_page__experience',
        namePath: ['fields', 5, 'fields', 2, 'name'],
      });
      expect(role?.systemColumns).toEqual([
        'id',
        'component_uid',
        'parent_id',
        'order_index',
      ]);
    });

    it('keeps component fields out of the parent columns', () => {
      const root = tables[0];
      expect(root?.kind).toBe('root');
      expect(root?.namePath).toEqual(['slug']);
      expect(root?.columns.map((column) => column.name)).toEqual([
        'position',
        'is_main',
        'company',
        'summary',
      ]);
      expect(root?.relationNames.map((relation) => relation.name)).toEqual([
        'cv_page_pk',
        'cv_page_draft_uq',
        'cv_page_published_uq',
        'cv_page_published_idx',
      ]);
    });

    it('uses the fixed repositoryLink spelling', () => {
      const project = tables.find((table) => table.name === 'cv_page__project');
      expect(project?.columns.map((column) => column.name)).toContain(
        'repository_link',
      );
    });
  });

  it('names a media foreign key per media column', () => {
    const [root] = planTables({
      slug: 'post',
      kind: 'collection',
      draftAndPublish: true,
      fields: [{ name: 'coverImage', type: 'media' }],
    });
    expect(root?.relationNames).toContainEqual({
      name: 'post_cover_image_media_fk',
      namePath: ['fields', 0, 'name'],
    });
  });
});
