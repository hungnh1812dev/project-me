import { Injectable } from '@nestjs/common';

/**
 * Injectable time source (epoch ms). Tests replace `now` on the instance
 * (`app.get(Clock)`) to move time without waiting.
 */
@Injectable()
export class Clock {
  now(): number {
    return Date.now();
  }
}
