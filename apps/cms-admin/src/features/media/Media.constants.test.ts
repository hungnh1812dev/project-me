import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_BYTES_BY_KIND } from './Media.constants';

interface PublishedMediaUpload {
  allowedMimeTypes: string[];
  maxBytesByKind: Record<string, number>;
}

const published = (
  JSON.parse(
    readFileSync(resolve(process.cwd(), '../cms-api/content/public-constants.json'), 'utf8'),
  ) as { mediaUpload: PublishedMediaUpload }
).mediaUpload;

describe('media constants against the cms-api public constants', () => {
  it('mirrors the published upload allowlist and limits', () => {
    expect([...MEDIA_ALLOWED_MIME_TYPES]).toEqual(published.allowedMimeTypes);
    expect(MEDIA_MAX_BYTES_BY_KIND).toEqual(published.maxBytesByKind);
  });
});
