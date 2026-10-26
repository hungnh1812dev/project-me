import { Inject, Injectable } from '@nestjs/common';

import {
  APP_LOGGER,
  type AppLogger,
} from '../../../infrastructure/logging/AppLogger.port';
import { ContentTypeRegistry } from '../domain/ContentTypeRegistry.entity';
import {
  CONTENT_TYPE_REPOSITORY,
  type ContentTypeRepository,
} from './ContentEngine.port';

const LOGGER_CONTEXT = 'ContentRegistry';

/**
 * The app's content registry, loaded on first use rather than at boot, so
 * the API starts (and readiness reports 503) while the database is down. A
 * failed load is retried on the next call; a successful one is kept for the
 * process lifetime, because content types change only through
 * `content:migrate` plus a restart (D10). When `content:migrate` never ran,
 * the registry is empty: every content subject is unknown and so denied
 * (fails closed).
 */
@Injectable()
export class ContentRegistry {
  private loading: Promise<ContentTypeRegistry> | undefined;

  constructor(
    @Inject(CONTENT_TYPE_REPOSITORY)
    private readonly contentTypes: ContentTypeRepository,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  registry(): Promise<ContentTypeRegistry> {
    if (this.loading === undefined) {
      const attempt = this.load();
      this.loading = attempt;
      attempt.catch(() => {
        if (this.loading === attempt) this.loading = undefined;
      });
    }
    return this.loading;
  }

  private async load(): Promise<ContentTypeRegistry> {
    const stored = await this.contentTypes.loadDefinitions();
    if (stored.status === 'not-migrated') {
      this.logger.warn(
        'content._content_types not found (run content:migrate); no content types are registered.',
        LOGGER_CONTEXT,
      );
      return ContentTypeRegistry.fromDefinitions([]);
    }
    return ContentTypeRegistry.fromDefinitions(stored.definitions);
  }
}
