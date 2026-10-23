import { Global, Module } from '@nestjs/common';

import { ClientIpResolver } from './client-ip.resolver';

/** Global so any module can inject `ClientIpResolver` without importing a module. */
@Global()
@Module({ providers: [ClientIpResolver], exports: [ClientIpResolver] })
export class ClientIpModule {}
