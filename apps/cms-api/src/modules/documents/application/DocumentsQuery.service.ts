import { Inject, Injectable } from '@nestjs/common';

import {
  AccessPolicyService,
  type ActorContext,
  PermissionAction,
  QueryGuard,
  recordReadAccess,
  RecordSerializer,
  type RowCondition,
  type SerializedRecord,
} from '../../access';
import {
  ContentRegistryProvider,
  type ContentStatus,
  type RegisteredContentType,
} from '../../content-engine';
import { DocumentMediaService } from '../../media';
import {
  documentNotFound,
  draftsForbidden,
  forbidden,
  unknownContentType,
} from '../domain/Documents.errors';
import type { ListDocumentsQuery } from '../domain/ListQuery.rules';
import {
  DOCUMENT_REPOSITORY,
  type DocumentRepository,
  type RecordReadAccess,
} from './Documents.port';

export interface DocumentPage {
  data: SerializedRecord[];
  meta: { page: number; pageSize: number; total: number };
}

/** Everything one read needs, decided before any SQL runs. */
interface ReadScope {
  type: RegisteredContentType;
  access: RecordReadAccess;
  /** Row-level conditions of the actor's `read` rows (SPEC §8.3); null = every row. */
  rowCondition: RowCondition | null;
  /** The copy to read; null for a type without draft and publish. */
  status: ContentStatus | null;
}

/**
 * SPEC §9 document reads. Every read follows the same order:
 * 1. the actor needs `read` (403) and, for `status=draft`, read + update (403);
 * 2. fields: `fieldsFor().readable` -> `recordReadAccess` -> projected
 *    columns, so a masked column is never selected (D3);
 * 3. `QueryGuard` checks filter and sort fields before any SQL (400);
 * 4. the repository reads: status + the actor's row conditions + filters;
 * 5. `RecordSerializer` builds every body.
 * The slug is only a registry lookup key; table and column names come from
 * the registry plan.
 */
@Injectable()
export class DocumentsQueryService {
  constructor(
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistryProvider,
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    private readonly media: DocumentMediaService,
  ) {}

  async list(
    actor: ActorContext,
    slug: string,
    query: ListDocumentsQuery,
  ): Promise<DocumentPage> {
    const scope = await this.scope(actor, slug, query.status);
    const { type, access } = scope;

    new QueryGuard(type).assert(
      {
        filter: query.filters.map((clause) => clause.path),
        sort: query.sort.map((key) => key.path),
      },
      access,
    );
    const { documents, total } = await this.documents.list(type, {
      access,
      status: scope.status,
      rowCondition: scope.rowCondition,
      filters: query.filters,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    });
    const serializedRecords = new RecordSerializer(type).serializeMany(
      documents,
      access,
    );
    await this.media.embed(type.root, serializedRecords);
    return {
      data: serializedRecords,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /** 404 when no such row is visible to the actor (also when a row condition hides it). */
  async get(
    actor: ActorContext,
    slug: string,
    documentId: string,
    status: ContentStatus,
  ): Promise<SerializedRecord> {
    const scope = await this.scope(actor, slug, status);
    const { type, access } = scope;

    const document = await this.documents.findOne(
      type,
      access,
      { documentId, status: scope.status },
      scope.rowCondition,
    );
    if (document === undefined) {
      throw documentNotFound();
    }
    const record = new RecordSerializer(type).serialize(document, access);
    await this.media.embed(type.root, [record]);
    return record;
  }

  private async scope(
    actor: ActorContext,
    slug: string,
    status: ContentStatus,
  ): Promise<ReadScope> {
    const { catalog, evaluator } = await this.access.policy();
    if (!catalog.isContentType(slug)) throw unknownContentType();
    if (status === 'draft' && !evaluator.canReadDrafts(actor, slug)) {
      throw draftsForbidden();
    }
    const rowFilter = evaluator.rowFilter(actor, PermissionAction.read, slug);
    if (!rowFilter.allowed) throw forbidden();

    const type = (await this.registry.registry()).resolve(slug);
    const readable = evaluator.fieldsFor(actor, slug).readable;
    return {
      type,
      access: recordReadAccess(actor, readable),
      rowCondition: rowFilter.where,
      status: type.definition.draftAndPublish ? status : null,
    };
  }
}
