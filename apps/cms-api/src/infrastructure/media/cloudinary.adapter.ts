import type { Readable } from 'node:stream';

import { v2 as cloudinary } from 'cloudinary';

import type { CloudinaryConfig } from '../../config/app-config';
import {
  CLOUDINARY_RAW_EXTENSION,
  CLOUDINARY_RESOURCE_TYPES,
  type MediaKind,
  THUMBNAIL_MAX_SIZE_PX,
} from './media.constants';
import type {
  MediaStorage,
  PutObjectInput,
  StoredObject,
} from './storage.port';

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
          {
            public_id: publicId,
            resource_type: resourceType,
            type: 'upload',
            overwrite: false,
            use_filename: false,
            unique_filename: false,
          },
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
