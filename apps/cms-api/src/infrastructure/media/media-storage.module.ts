import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import {
  CloudinaryMediaStorage,
  createCloudinaryClient,
} from './cloudinary.adapter';
import { FakeMediaStorage } from './fake.adapter';
import { MEDIA_STORAGE, type MediaStorage } from './storage.port';

type MediaProvider = IAppConfig['media']['provider'];
type MediaStorageFactory = (config: IAppConfig) => MediaStorage;

function createFakeMediaStorage(config: IAppConfig): MediaStorage {
  // Defence in depth: env.schema.ts already rejects this provider in production.
  if (config.isProduction) {
    throw new Error('The fake media storage is not allowed in production');
  }
  return new FakeMediaStorage();
}

function createCloudinaryMediaStorage(config: IAppConfig): MediaStorage {
  const { cloudinary } = config.media;
  // env.schema.ts requires the Cloudinary keys for this provider.
  if (cloudinary === undefined) {
    throw new Error('Cloudinary media storage is not configured');
  }
  return new CloudinaryMediaStorage(
    createCloudinaryClient(cloudinary),
    cloudinary.folder,
  );
}

/** One factory per MEDIA_PROVIDERS entry; the type forces a new provider to add one. */
export const MEDIA_STORAGE_FACTORIES: Record<
  MediaProvider,
  MediaStorageFactory
> = {
  fake: createFakeMediaStorage,
  cloudinary: createCloudinaryMediaStorage,
};

export function createMediaStorage(config: IAppConfig): MediaStorage {
  const { provider } = config.media;
  if (!Object.hasOwn(MEDIA_STORAGE_FACTORIES, provider)) {
    throw new Error(`No media storage for MEDIA_PROVIDER=${provider}`);
  }
  return MEDIA_STORAGE_FACTORIES[provider](config);
}

/** Provides `MEDIA_STORAGE` for the configured MEDIA_PROVIDER. */
@Module({
  providers: [
    {
      provide: MEDIA_STORAGE,
      inject: [APP_CONFIG],
      useFactory: createMediaStorage,
    },
  ],
  exports: [MEDIA_STORAGE],
})
export class MediaStorageModule {}
