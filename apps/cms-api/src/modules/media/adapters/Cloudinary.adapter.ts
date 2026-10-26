import type { Readable } from 'node:stream';

import { v2 as cloudinary } from 'cloudinary';

import type { CloudinaryConfig } from '../../../config/app-config';
import type { MediaKind } from '../domain/Media.constants';
import type {
  MediaStorage,
  PutObjectInput,
  StoredObject,
} from '../application/Media.port';

/** Longest side of the generated image thumbnail, in pixels. */
const THUMBNAIL_MAX_SIZE_PX = 320;

/** Cloudinary resource types per media kind. */
const CLOUDINARY_RESOURCE_TYPES = {
  image: 'image',
  pdf: 'raw',
  video: 'video',
} as const satisfies Record<MediaKind, string>;

/** Raw resources keep their extension in the public id. */
const CLOUDINARY_RAW_EXTENSION = '.pdf';

type ResourceType = (typeof CLOUDINARY_RESOURCE_TYPES)[MediaKind];

/** The slice of the Cloudinary SDK the adapter uses; tests stub it. */
export interface CloudinaryClient {
  uploadStream(
    publicId: string,
    resourceType: ResourceType,
    body: Readable,
  ): Promise<{ secureUrl: string }>;
  destroy(publicId: string, resourceType: ResourceType): Promise<void>;
  thumbnailUrl(publicId: string): string;
}

/** Options of every upload: fixed id, never overwrite, no name guessing. */
export function cloudinaryUploadOptions(
  publicId: string,
  resourceType: ResourceType,
) {
  return {
    public_id: publicId,
    resource_type: resourceType,
    type: 'upload',
    overwrite: false,
    use_filename: false,
    unique_filename: false,
  } as const;
}

/** SDK-backed client. Credentials come from the validated config only. */
export function createCloudinaryClient(
  config: CloudinaryConfig,
): CloudinaryClient {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
  return {
    uploadStream: (publicId, resourceType, body) =>
      new Promise((resolve, reject) => {
        const sink = cloudinary.uploader.upload_stream(
          cloudinaryUploadOptions(publicId, resourceType),
          (error, result) => {
            if (error !== undefined || result === undefined) {
              reject(
                error instanceof Error
                  ? error
                  : new Error('Cloudinary upload failed'),
              );
              return;
            }
            resolve({ secureUrl: result.secure_url });
          },
        );
        body.on('error', reject);
        body.pipe(sink);
      }),
    destroy: async (publicId, resourceType) => {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate: true,
      });
    },
    thumbnailUrl: (publicId) =>
      cloudinary.url(publicId, {
        secure: true,
        transformation: [
          {
            width: THUMBNAIL_MAX_SIZE_PX,
            height: THUMBNAIL_MAX_SIZE_PX,
            crop: 'limit',
            fetch_format: 'auto',
            quality: 'auto',
          },
        ],
      }),
  };
}

/** Cloudinary storage (MEDIA_PROVIDER=cloudinary). */
export class CloudinaryMediaStorage implements MediaStorage {
  constructor(
    private readonly client: CloudinaryClient,
    private readonly folder: string | undefined,
  ) {}

  async put(input: PutObjectInput): Promise<StoredObject> {
    const publicId = this.publicIdOf(input.key, input.kind);
    const { secureUrl } = await this.client.uploadStream(
      publicId,
      CLOUDINARY_RESOURCE_TYPES[input.kind],
      input.body,
    );
    return {
      url: secureUrl,
      thumbnailUrl:
        input.kind === 'image' ? this.client.thumbnailUrl(publicId) : null,
    };
  }

  delete(key: string, kind: MediaKind): Promise<void> {
    return this.client.destroy(
      this.publicIdOf(key, kind),
      CLOUDINARY_RESOURCE_TYPES[kind],
    );
  }

  private publicIdOf(key: string, kind: MediaKind): string {
    const name = kind === 'pdf' ? `${key}${CLOUDINARY_RAW_EXTENSION}` : key;
    return this.folder === undefined ? name : `${this.folder}/${name}`;
  }
}
