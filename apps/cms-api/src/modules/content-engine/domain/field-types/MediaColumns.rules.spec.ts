import { ContentTypeRegistry } from '../ContentTypeRegistry.entity';
import {
  mediaColumnsOf,
  mediaFieldNamesByTable,
  richtextColumnsOf,
  richtextFieldNamesByTable,
} from './MediaColumns.rules';

const GALLERY = {
  slug: 'gallery',
  displayName: 'Gallery',
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    { name: 'cover', type: 'media' },
    { name: 'title', type: 'string' },
    { name: 'body', type: 'richtext' },
    {
      name: 'block',
      type: 'component',
      component: 'block',
      fields: [
        { name: 'heroImage', type: 'media' },
        { name: 'caption', type: 'richtext' },
      ],
    },
  ],
} as const;
const NOTE = {
  slug: 'note',
  displayName: 'Note',
  kind: 'collection',
  draftAndPublish: false,
  fields: [{ name: 'text', type: 'text' }],
} as const;

describe('mediaColumnsOf', () => {
  const registry = ContentTypeRegistry.fromDefinitions([GALLERY, NOTE]);

  it('lists a media field at the root and inside a component', () => {
    expect(mediaColumnsOf(registry)).toEqual([
      { tableName: 'gallery', columnName: 'cover', fieldName: 'cover' },
      {
        tableName: 'gallery__block',
        columnName: 'hero_image',
        fieldName: 'heroImage',
      },
    ]);
  });

  it('returns names only, nothing that is SQL', () => {
    for (const ref of mediaColumnsOf(registry)) {
      expect(Object.keys(ref).sort()).toEqual(['columnName', 'fieldName', 'tableName']);
    }
  });

  it('is empty when no content type has a media field', () => {
    expect(mediaColumnsOf(ContentTypeRegistry.fromDefinitions([NOTE]))).toEqual([]);
  });

  it('groups field names by table', () => {
    expect(mediaFieldNamesByTable(registry)).toEqual(
      new Map([
        ['gallery', ['cover']],
        ['gallery__block', ['heroImage']],
      ]),
    );
  });
});

describe('richtextColumnsOf', () => {
  const registry = ContentTypeRegistry.fromDefinitions([GALLERY, NOTE]);

  it('lists a richtext field at the root and inside a component, not string or text', () => {
    expect(richtextColumnsOf(registry)).toEqual([
      { tableName: 'gallery', columnName: 'body', fieldName: 'body' },
      { tableName: 'gallery__block', columnName: 'caption', fieldName: 'caption' },
    ]);
  });

  it('is empty when no content type has a richtext field', () => {
    expect(richtextColumnsOf(ContentTypeRegistry.fromDefinitions([NOTE]))).toEqual([]);
  });

  it('groups field names by table', () => {
    expect(richtextFieldNamesByTable(registry)).toEqual(
      new Map([
        ['gallery', ['body']],
        ['gallery__block', ['caption']],
      ]),
    );
  });
});
