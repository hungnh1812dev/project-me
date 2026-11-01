import { randomUUID } from 'node:crypto';
import { accessSync, constants, createWriteStream, mkdirSync } from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { LocalMediaConfig } from '../../../config/AppConfig.setup';
import type {
  MediaStorage,
  PublicMediaFile,
  PutObjectInput,
  StoredObject,
} from '../application/Media.port';
import { MEDIA_FILE_EXTENSIONS, type MediaKind } from '../domain/Media.constants';
import { ALLOWED_MEDIA_TYPES, type AllowedMime } from '../domain/MediaUpload.rules';
import { isUuidv7 } from '../domain/Uuidv7.rules';

const EXTENSION_SEPARATOR = '.';
const TEMP_SUFFIX = '.tmp';

const MIME_BY_EXTENSION: ReadonlyMap<string, AllowedMime> = new Map(
  (Object.keys(MEDIA_FILE_EXTENSIONS) as AllowedMime[]).map((mime) => [
    MEDIA_FILE_EXTENSIONS[mime],
    mime,
  ]),
);

function extensionsOfKind(kind: MediaKind): string[] {
  return (Object.keys(ALLOWED_MEDIA_TYPES) as AllowedMime[])
    .filter((mime) => ALLOWED_MEDIA_TYPES[mime].kind === kind)
    .map((mime) => MEDIA_FILE_EXTENSIONS[mime]);
}

/** The MIME type of a `<uuidv7>.<ext>` name, `undefined` for any other name. */
function mimeOfPublicFileName(fileName: string): AllowedMime | undefined {
  const dot = fileName.indexOf(EXTENSION_SEPARATOR);
  if (dot < 0) return undefined;
  const extension = fileName.slice(dot + 1);
  if (!isUuidv7(fileName.slice(0, dot)) || !MIME_BY_EXTENSION.has(extension)) return undefined;
  return MIME_BY_EXTENSION.get(extension);
}

function isMissingFile(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ELOOP';
}

/**
 * Files on the local disk (MEDIA_PROVIDER=local, ADR 0021): the dev and
 * smoke stacks only. Nothing outside this class reads the directory, and no
 * request input is ever joined to a path before it matches `<uuidv7>.<ext>`.
 */
export class LocalMediaStorage implements MediaStorage {
  readonly provider = 'local';
  readonly deliveryOrigin: string;

  private readonly directory: string;

  /** `directory` is resolved once here; every path is joined to this value. */
  constructor(
    directory: string,
    private readonly publicUrl: string,
  ) {
    this.directory = resolve(directory);
    this.deliveryOrigin = new URL(publicUrl).origin;
  }

  /** Creates the directory when missing and fails when it is not writable (boot). */
  static open(config: LocalMediaConfig): LocalMediaStorage {
    const storage = new LocalMediaStorage(config.directory, config.publicUrl);
    mkdirSync(storage.directory, { recursive: true });
    accessSync(storage.directory, constants.W_OK);
    return storage;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const extension = (MEDIA_FILE_EXTENSIONS as Record<string, string | undefined>)[input.mimeType];
    if (!isUuidv7(input.key) || extension === undefined) {
      throw new Error('The local media storage got an unusable key or type');
    }
    const fileName = `${input.key}${EXTENSION_SEPARATOR}${extension}`;
    const tempPath = join(this.directory, `${randomUUID()}${TEMP_SUFFIX}`);
    try {
      await pipeline(input.body, createWriteStream(tempPath, { flags: 'wx' }));
      await rename(tempPath, join(this.directory, fileName));
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
    const url = `${this.publicUrl}/${fileName}`;
    return { url, thumbnailUrl: input.kind === 'image' ? url : null };
  }

  async delete(key: string, kind: MediaKind): Promise<void> {
    if (!isUuidv7(key)) return;
    await Promise.all(
      extensionsOfKind(kind).map((extension) =>
        rm(join(this.directory, `${key}${EXTENSION_SEPARATOR}${extension}`), { force: true }),
      ),
    );
  }

  async openPublicFile(fileName: string): Promise<PublicMediaFile | null> {
    const mimeType = mimeOfPublicFileName(fileName);
    if (mimeType === undefined) return null;
    try {
      // O_NOFOLLOW: a symlink planted in the directory is not served.
      const handle = await open(
        join(this.directory, fileName),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const { size, isFile } = await handle.stat().then((stats) => ({
        size: stats.size,
        isFile: stats.isFile(),
      }));
      if (!isFile) {
        await handle.close();
        return null;
      }
      return { stream: handle.createReadStream(), mimeType, size };
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }
}
