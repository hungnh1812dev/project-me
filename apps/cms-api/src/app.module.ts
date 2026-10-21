import { type DynamicModule, Module } from '@nestjs/common';

import { type IAppConfig } from './config/app-config';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { ConfigModule } from './config/config.module';
import { AccessManagementModule } from './modules/access/access-management.module';
import { ContentTypesModule } from './modules/content-types/content-types.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { MediaModule } from './modules/media/media.module';

@Module({})
export class AppModule {
  static forRoot(config: IAppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        RateLimitModule,
        HealthModule,
        IdentityModule,
        AccessManagementModule,
        ContentTypesModule,
        DocumentsModule,
        MediaModule,
      ],
    };
  }
}
