import { type DynamicModule, Module } from '@nestjs/common';

import { type IAppConfig } from './config/AppConfig.setup';
import { ClientIpModule } from './common/http/ClientIp.module';
import { RateLimitModule } from './common/rate-limit/RateLimit.module';
import { ClockModule } from './common/time/Clock.module';
import { ConfigModule } from './config/Config.module';
import { LoggingModule } from './infrastructure/logging/Logging.module';
import { ActorThrottleSubjectResolver } from './modules/access';
import { AccessManagementModule } from './modules/access/management';
import { BackupsModule } from './modules/backups';
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
        ClockModule,
        LoggingModule,
        ClientIpModule,
        RateLimitModule.forRoot({
          subjectResolver: ActorThrottleSubjectResolver,
        }),
        HealthModule,
        IdentityModule,
        AccessManagementModule,
        ContentTypesModule,
        DocumentsModule,
        GraphqlModule,
        MediaModule,
        ReviewerModule,
        BackupsModule,
      ],
    };
  }
}
