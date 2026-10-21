import { Injectable } from '@nestjs/common';

import type { ActivityRecorder } from './activity.port';

/** Activity tracking `none`: the default; records nothing. */
@Injectable()
export class NoneActivityRecorder implements ActivityRecorder {
  record(): Promise<void> {
    return Promise.resolve();
  }
}
