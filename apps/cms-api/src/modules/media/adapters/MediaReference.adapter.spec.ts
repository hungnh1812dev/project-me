import { ContentTypeRegistry } from '../../content-engine';
import { mediaReferenceQuery } from './MediaReference.adapter';

const WITH_MEDIA = {
  slug: 'gallery',
  displayName: 'Gallery',
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    { name: 'cover', type: 'media' },
    { name: 'body', type: 'richtext' },
    {
      name: 'block',
      type: 'component',
      fields: [
        { name: 'heroImage', type: 'media' },
        { name: 'caption', type: 'richtext' },
      ],
    },
  ],
} as const;
const WITHOUT_MEDIA = {
  slug: 'note',
  displayName: 'Note',
  kind: 'collection',
  draftAndPublish: false,
  fields: [{ name: 'text', type: 'text' }],
} as const;

describe('mediaReferenceQuery', () => {
  it('probes every media column of roots and components with quoted names', () => {
    const registry = ContentTypeRegistry.fromDefinitions([WITH_MEDIA, WITHOUT_MEDIA]);
    const query = mediaReferenceQuery(registry);
    expect(query).toContain('"content"."gallery" where "cover" = $1');
    expect(query).toContain('"content"."gallery__block" where "hero_image" = $1');
    expect(query).not.toContain('"note"');
  });

  it('probes every richtext column with a bound marker, never an inlined value', () => {
    const query = mediaReferenceQuery(
      ContentTypeRegistry.fromDefinitions([WITH_MEDIA, WITHOUT_MEDIA]),
    );
    expect(query).toContain(`"body" ~ ('<img\\s[^>]*\\sdata-media-id="' || $2 || '"')`);
    expect(query).toContain('"content"."gallery__block" where "caption" ~ (');
    expect(query).not.toMatch(/data-media-id="[0-9a-f]/);
  });

  it('probes richtext columns when there is no media field', () => {
    const richtextOnly = { ...WITHOUT_MEDIA, fields: [{ name: 'text', type: 'richtext' }] };
    expect(mediaReferenceQuery(ContentTypeRegistry.fromDefinitions([richtextOnly]))).toContain(
      '"text" ~ (',
    );
  });

  it('is null when no content type has a media field', () => {
    const registry = ContentTypeRegistry.fromDefinitions([WITHOUT_MEDIA]);
    expect(mediaReferenceQuery(registry)).toBeNull();
  });
});
