import { Module } from '@nestjs/common';

import { ACTIVITY_RECORDER } from './activity.port';
import { NoneActivityRecorder } from './none-activity.recorder';

/** Binds the active activity adapter. Only `none` exists; a `database` adapter replaces the binding here. */
@Module({
  providers: [{ provide: ACTIVITY_RECORDER, useClass: NoneActivityRecorder }],
  exports: [ACTIVITY_RECORDER],
})
export class ActivityModule {}
