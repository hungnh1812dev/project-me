import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/AppConfig.setup';
import { APP_CONFIG } from '../../config/Config.constants';
import { DatabaseModule } from '../../infrastructure/database/Database.module';
import { AccessModule } from '../access';
import { ContentEngineModule } from '../content-engine';
import { SecurityAuditModule } from '../security-audit';
import {
  CloudinaryMediaStorage,
  createCloudinaryClient,
} from './adapters/Cloudinary.adapter';
import { FakeMediaStorage } from './adapters/Fake.adapter';
import { MediaReferenceAdapter } from './adapters/MediaReference.adapter';
import { PrismaMediaRepository } from './adapters/PrismaMedia.repository';
import { UploadProcessingAdapter } from './adapters/UploadProcessing.adapter';
import { DocumentMediaService } from './application/DocumentMedia.service';
import {
  MEDIA_REFERENCE_CHECKER,
  MEDIA_REPOSITORY,
  MEDIA_STORAGE,
  UPLOAD_PROCESSOR,
  type MediaStorage,
} from './application/Media.port';
import { MediaLibraryService } from './application/MediaLibrary.service';
import { PurgeDeletedMediaService } from './application/PurgeDeletedMedia.service';
import { UploadMediaService } from './application/UploadMedia.service';
import { MediaController } from './http/Media.controller';
import { MediaPurgeJob } from './jobs/MediaPurge.job';

type MediaProvider = IAppConfig['media']['provider'];
type MediaStorageFactory = (config: IAppConfig) => MediaStorage;

function createFakeMediaStorage(config: IAppConfig): MediaStorage {
  // Defence in depth: Env.schema.ts already rejects this provider in production.
  if (config.isProduction) {
    throw new Error('The fake media storage is not allowed in production');
  }
  return new FakeMediaStorage();
}

function createCloudinaryMediaStorage(config: IAppConfig): MediaStorage {
  const { cloudinary } = config.media;
  // Env.schema.ts requires the Cloudinary keys for this provider.
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

/** File library: upload pipeline, storage for the configured MEDIA_PROVIDER, library use cases and purge job. */
@Module({
  imports: [
    AccessModule,
    ContentEngineModule,
    DatabaseModule,
    SecurityAuditModule,
  ],
  controllers: [MediaController],
  providers: [
    MediaLibraryService,
    DocumentMediaService,
    PurgeDeletedMediaService,
    UploadMediaService,
    MediaPurgeJob,
    { provide: MEDIA_REPOSITORY, useClass: PrismaMediaRepository },
    { provide: MEDIA_REFERENCE_CHECKER, useClass: MediaReferenceAdapter },
    { provide: UPLOAD_PROCESSOR, useClass: UploadProcessingAdapter },
    {
      provide: MEDIA_STORAGE,
      inject: [APP_CONFIG],
      useFactory: createMediaStorage,
    },
  ],
  exports: [DocumentMediaService],
})
export class MediaModule {}
