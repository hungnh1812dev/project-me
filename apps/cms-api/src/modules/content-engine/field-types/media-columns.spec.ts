import { RegistryService } from '../registry.service';
import { mediaColumnsOf, mediaFieldNamesByTable } from './media-columns';

const GALLERY = {
  slug: 'gallery',
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    { name: 'cover', type: 'media' },
    { name: 'title', type: 'string' },
    {
      name: 'block',
      type: 'component',
      fields: [{ name: 'heroImage', type: 'media' }],
    },
  ],
} as const;
const NOTE = {
  slug: 'note',
  kind: 'collection',
  draftAndPublish: false,
  fields: [{ name: 'text', type: 'text' }],
} as const;

describe('mediaColumnsOf', () => {
  const registry = RegistryService.fromDefinitions([GALLERY, NOTE]);

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
      expect(Object.keys(ref).sort()).toEqual([
        'columnName',
        'fieldName',
        'tableName',
      ]);
    }
  });

  it('is empty when no content type has a media field', () => {
    expect(mediaColumnsOf(RegistryService.fromDefinitions([NOTE]))).toEqual([]);
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
