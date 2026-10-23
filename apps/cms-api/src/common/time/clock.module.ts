import { Global, Module } from '@nestjs/common';

import { Clock } from './clock';

/** Global so any module can inject `Clock` without importing a module. */
@Global()
@Module({ providers: [Clock], exports: [Clock] })
export class ClockModule {}
