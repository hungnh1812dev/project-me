import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import {
  CloudinaryMediaStorage,
  createCloudinaryClient,
} from './cloudinary.adapter';
import { FakeMediaStorage } from './fake.adapter';
import { MEDIA_STORAGE, type MediaStorage } from './storage.port';

export function createMediaStorage(config: IAppConfig): MediaStorage {
  if (config.media.provider === 'fake') return new FakeMediaStorage();
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
