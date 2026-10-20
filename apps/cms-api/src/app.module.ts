import { type DynamicModule, Module } from '@nestjs/common';

import { type IAppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';

@Module({})
export class AppModule {
  static forRoot(config: IAppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), HealthModule, IdentityModule],
    };
  }
}
