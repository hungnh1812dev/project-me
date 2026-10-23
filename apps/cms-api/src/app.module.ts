import { type DynamicModule, Module } from '@nestjs/common';

import { type IAppConfig } from './config/app-config';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { ConfigModule } from './config/config.module';
import { AccessManagementModule } from './modules/access/management';
import { ContentTypesModule } from './modules/content-types';
import { DocumentsModule } from './modules/documents';
import { GraphqlModule } from './modules/graphql';
import { HealthModule } from './modules/health';
import { IdentityModule } from './modules/identity';
import { MediaModule } from './modules/media';
import { ReviewerModule } from './modules/reviewer';

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
        GraphqlModule,
        MediaModule,
        ReviewerModule,
      ],
    };
  }
}
