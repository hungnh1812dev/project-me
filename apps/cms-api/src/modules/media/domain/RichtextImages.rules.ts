import type { EmbeddedMedia } from './Media.entity';

/** The file facts a richtext image needs: where it is served and whether it is an image. */
export type RichtextImageFile = Pick<EmbeddedMedia, 'url' | 'mimeType'>;

const IMAGE_MIME_PREFIX = 'image/';

/*
 * Stored richtext is the sanitizer's output: every attribute value is
 * double-quoted and `<`, `>` and `"` inside a value are entity-escaped, so a
 * tag ends at the first `>` and a quoted value holds none of them.
 */
const IMG_TAG = /<img\b[^>]*>/gi;
const MEDIA_ID_ATTRIBUTE = /\sdata-media-id="([^"]*)"/i;
/** Same shape the sanitizer accepts on write; anything else must never reach a `::uuid` cast. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SRC_ATTRIBUTE = /(\ssrc=)"[^"]*"/i;

function escapeAttributeValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function mediaIdOf(imgTag: string): string | undefined {
  return MEDIA_ID_ATTRIBUTE.exec(imgTag)?.[1]?.toLowerCase();
}

function withSrc(imgTag: string, url: string): string {
  const src = escapeAttributeValue(url);
  return SRC_ATTRIBUTE.test(imgTag)
    ? imgTag.replace(SRC_ATTRIBUTE, (_match, prefix: string) => `${prefix}"${src}"`)
    : imgTag.replace(/^<img\b/i, `<img src="${src}"`);
}

/** The distinct, well-formed media file ids (lowercase uuids) of the `img[data-media-id]` elements. */
export function mediaIdsInRichtext(html: string): string[] {
  const ids = new Set<string>();
  for (const tag of html.matchAll(IMG_TAG)) {
    const id = mediaIdOf(tag[0]);
    if (id !== undefined && UUID.test(id)) ids.add(id);
  }
  return [...ids];
}

/**
 * Points every `img[data-media-id]` at its file's current url; removes the
 * image when the file is missing, its id is malformed, deleted (absent from `filesById`) or not an
 * `image/*` file. Other markup, and images without a media id, stay as they are.
 * `filesById` is keyed by lowercase uuid.
 */
export function rewriteRichtextImages(
  html: string,
  filesById: ReadonlyMap<string, RichtextImageFile>,
): string {
  return html.replace(IMG_TAG, (tag) => {
    const id = mediaIdOf(tag);
    if (id === undefined) return tag;
    const file = filesById.get(id);
    return file?.mimeType.startsWith(IMAGE_MIME_PREFIX) === true ? withSrc(tag, file.url) : '';
  });
}
