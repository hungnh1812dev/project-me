import { Injectable, Logger } from '@nestjs/common';

import type { AppLogger } from './AppLogger.port';

/** `AppLogger` on the Nest `Logger`, so output keeps the Nest format. */
@Injectable()
export class NestAppLogger implements AppLogger {
  private readonly logger = new Logger();

  warn(message: string, context?: string): void {
    this.logger.warn(message, context);
  }

  error(message: string, context?: string): void {
    this.logger.error(message, undefined, context);
  }
}
