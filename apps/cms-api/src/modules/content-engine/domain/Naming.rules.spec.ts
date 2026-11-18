import type {
  ComponentFieldDefinition,
  ContentTypeDefinition,
  FieldDefinition,
} from './DefinitionSchema.rules';
import {
  componentTableName,
  planTables,
  relationNames,
  rootTableName,
  toSqlIdentifier,
} from './Naming.rules';

function text(name: string): FieldDefinition {
  return { name, type: 'text' };
}

function component(
  name: string,
  value: string,
  fields: FieldDefinition[],
): ComponentFieldDefinition {
  return { name, type: 'component', component: value, repeatable: true, fields };
}

/** The component layout of the cv-page content type (names differ from component values). */
function cvPage(): ContentTypeDefinition {
  return {
    slug: 'cv-page',
    displayName: 'CV page',
    kind: 'single',
    draftAndPublish: true,
    fields: [
      text('position'),
      { name: 'isMain', type: 'boolean' },
      component('skills', 'skill', [text('level')]),
      component('experiences', 'experience', [
        text('company'),
        component('roles', 'role', [
          text('position'),
          component('projects', 'project', [{ name: 'repositoryLink', type: 'text' }]),
        ]),
      ]),
      component('educations', 'education', [text('degree')]),
      component('languages', 'language', [text('language')]),
      component('references', 'referee', [text('phone')]),
    ],
  };
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
    expect(componentTableName(componentTableName('cv_page', 'experience'), 'role')).toBe(
      'cv_page__experience__role',
    );
    expect(componentTableName('cv_page', 'subNavigation')).toBe('cv_page__sub_navigation');
  });

  it('composes relation names from the table name', () => {
    expect(relationNames.primaryKey('t')).toBe('t_pk');
    expect(relationNames.parentForeignKey('t')).toBe('t_parent_fk');
    expect(relationNames.parentOrderIndex('t')).toBe('t_parent_idx');
    expect(relationNames.draftUnique('t')).toBe('t_draft_uq');
    expect(relationNames.publishedUnique('t')).toBe('t_published_uq');
    expect(relationNames.publishedListIndex('t')).toBe('t_published_idx');
    expect(relationNames.mediaForeignKey('t', 'photo')).toBe('t_photo_media_fk');
  });

  describe('planTables(cv-page)', () => {
    const tables = planTables(cvPage());

    it('names the root and the 7 component tables after the component values', () => {
      expect(tables.map((table) => table.name)).toEqual([
        'cv_page',
        'cv_page__skill',
        'cv_page__experience',
        'cv_page__experience__role',
        'cv_page__experience__role__project',
        'cv_page__education',
        'cv_page__language',
        'cv_page__referee',
      ]);
    });

    it('records the dotted API path of each table', () => {
      expect(tables.map((table) => table.apiPath)).toEqual([
        '',
        'skills',
        'experiences',
        'experiences.roles',
        'experiences.roles.projects',
        'educations',
        'languages',
        'references',
      ]);
    });

    it('links each component to its direct parent', () => {
      const role = tables.find((table) => table.name === 'cv_page__experience__role');
      expect(role).toMatchObject({
        kind: 'component',
        depth: 2,
        parentTable: 'cv_page__experience',
        namePath: ['fields', 3, 'fields', 1, 'component'],
      });
      expect(role?.systemColumns).toEqual(['id', 'component_uid', 'parent_id', 'order_index']);
    });

    it('keeps component fields out of the parent columns', () => {
      const root = tables[0];
      expect(root?.kind).toBe('root');
      expect(root?.namePath).toEqual(['slug']);
      expect(root?.columns.map((column) => column.name)).toEqual(['position', 'is_main']);
      expect(root?.relationNames.map((relation) => relation.name)).toEqual([
        'cv_page_pk',
        'cv_page_draft_uq',
        'cv_page_published_uq',
        'cv_page_published_idx',
      ]);
    });
  });

  it('names a media foreign key per media column', () => {
    const [root] = planTables({
      slug: 'post',
      displayName: 'Post',
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
