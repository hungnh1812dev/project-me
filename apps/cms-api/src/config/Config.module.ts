import { type DynamicModule, Global, Module } from '@nestjs/common';

import { type IAppConfig } from './AppConfig.setup';
import { APP_CONFIG } from './Config.constants';

/** Makes the already-validated config injectable everywhere as `APP_CONFIG`. */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: IAppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
