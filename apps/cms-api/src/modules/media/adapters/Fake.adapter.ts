import type { Readable } from 'node:stream';

import type { MediaKind } from '../domain/Media.constants';
import type {
  MediaStorage,
  PutObjectInput,
  StoredObject,
} from '../application/Media.port';

/** Origin of URLs handed out by the in-memory fake storage (never reachable). */
export const FAKE_STORAGE_ORIGIN = 'https://fake-media.invalid';
const FAKE_THUMBNAIL_PATH = 'thumb';

export interface FakeStoredObject {
  readonly kind: MediaKind;
  readonly mimeType: string;
  readonly bytes: Buffer;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

/**
 * In-memory storage for development and tests (MEDIA_PROVIDER=fake). Lost
 * on restart; never allowed in production (env.schema.ts).
 */
export class FakeMediaStorage implements MediaStorage {
  private readonly objects = new Map<string, FakeStoredObject>();

  async put(input: PutObjectInput): Promise<StoredObject> {
    const bytes = await readAll(input.body);
    this.objects.set(input.key, {
      kind: input.kind,
      mimeType: input.mimeType,
      bytes,
    });
    const url = `${FAKE_STORAGE_ORIGIN}/${input.key}`;
    return {
      url,
      thumbnailUrl:
        input.kind === 'image'
          ? `${FAKE_STORAGE_ORIGIN}/${FAKE_THUMBNAIL_PATH}/${input.key}`
          : null,
    };
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  /** Test helpers. */
  get(key: string): FakeStoredObject | undefined {
    return this.objects.get(key);
  }

  keys(): string[] {
    return [...this.objects.keys()];
  }
}
