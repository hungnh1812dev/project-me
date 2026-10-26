import { Global, Module } from '@nestjs/common';

import { Clock } from './Clock.service';

/** Global so any module can inject `Clock` without importing a module. */
@Global()
@Module({ providers: [Clock], exports: [Clock] })
export class ClockModule {}
