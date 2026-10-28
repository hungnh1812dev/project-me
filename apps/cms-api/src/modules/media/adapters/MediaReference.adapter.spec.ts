import { ContentTypeRegistry } from '../../content-engine';
import { mediaReferenceQuery } from './MediaReference.adapter';

const WITH_MEDIA = {
  slug: 'gallery',
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    { name: 'cover', type: 'media' },
    {
      name: 'block',
      type: 'component',
      fields: [{ name: 'heroImage', type: 'media' }],
    },
  ],
} as const;
const WITHOUT_MEDIA = {
  slug: 'note',
  kind: 'collection',
  draftAndPublish: false,
  fields: [{ name: 'text', type: 'text' }],
} as const;

describe('mediaReferenceQuery', () => {
  it('probes every media column of roots and components with quoted names', () => {
    const registry = ContentTypeRegistry.fromDefinitions([
      WITH_MEDIA,
      WITHOUT_MEDIA,
    ]);
    const query = mediaReferenceQuery(registry);
    expect(query).toContain('"content"."gallery" where "cover" = $1');
    expect(query).toContain(
      '"content"."gallery__block" where "hero_image" = $1',
    );
    expect(query).not.toContain('"note"');
  });

  it('is null when no content type has a media field', () => {
    const registry = ContentTypeRegistry.fromDefinitions([WITHOUT_MEDIA]);
    expect(mediaReferenceQuery(registry)).toBeNull();
  });
});
