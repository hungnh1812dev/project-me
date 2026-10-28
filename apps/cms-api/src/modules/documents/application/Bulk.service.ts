import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { type DomainError } from '../../../common/errors/Domain.errors';
import { Clock } from '../../../common/time/Clock.service';
import {
  CONTENT_TRANSACTION_RUNNER,
  type ContentTransactionRunner,
  type UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import {
  AccessPolicyService,
  type ActorContext,
  PermissionAction,
} from '../../access';
import { ContentRegistry, type InsertTreeInput } from '../../content-engine';
import {
  BULK_ITEM_STATUS,
  BULK_LIMITS,
  type BulkOperation,
  type BulkRequest,
  type PublishItem,
} from '../domain/Documents.constants';
import {
  bulkNotCollection,
  forbidden,
  invalidBody,
  mapContentErrors,
  tooManyComponentRows,
  unknownContentType,
} from '../domain/Documents.errors';
import { countComponentRows } from '../domain/ValueValidator.rules';
import {
  asItemError,
  atomicFailure,
  type BulkItemError,
  itemError,
} from './BulkItem.errors';
import { DOCUMENT_REPOSITORY, type DocumentRepository } from './Documents.port';
import { DocumentsCommandService } from './DocumentsCommand.service';
import { type ActionScope, PublishService } from './Publish.service';

export interface BulkItemOk {
  index: number;
  status: typeof BULK_ITEM_STATUS.OK;
  documentId: string;
  /** Version of the draft (create: 1; publish: the published draft version). */
  version?: number;
}

export type BulkItemResult = BulkItemOk | BulkItemError;

export interface BulkResponse {
  atomic: boolean;
  succeeded: number;
  failed: number;
  results: BulkItemResult[];
}

/**
 * SPEC §9 bulk, collections only. Every item goes through the same
 * checks as the single-document write (policy, row conditions, allowlist,
 * value rules, OCC for publish), reusing `DocumentsCommandService` and
 * `PublishService`.
 * - `atomic: true`: one transaction; the first failing item aborts everything
 *   and the request fails with that item's error (`details.index`).
 * - `atomic: false`: item errors are reported per item; each non-create item
 *   runs in a savepoint, so one failure undoes only that item. Create items
 *   are validated one by one (no SQL), then the valid ones are inserted in one
 *   batch (one INSERT per table level, `RETURNING id`).
 * Bodies carry ids and versions only, never records, so a bulk write is never
 * a way to read what a read would refuse. Activity is told after commit.
 */
@Injectable()
export class BulkService {
  constructor(
    private readonly access: AccessPolicyService,
    private readonly registry: ContentRegistry,
    @Inject(CONTENT_TRANSACTION_RUNNER)
    private readonly transactions: ContentTransactionRunner,
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    private readonly commands: DocumentsCommandService,
    private readonly publishing: PublishService,
    private readonly clock: Clock,
  ) {}

  async create(
    actor: ActorContext,
    slug: string,
    request: BulkRequest<unknown>,
  ): Promise<BulkResponse> {
    this.assertWriter(actor);
    const { evaluator } = await this.access.policy();
    if (!evaluator.can(actor, PermissionAction.create, slug)) {
      throw forbidden();
    }
    const type = await this.collection(slug);

    const errors = new Map<number, DomainError>();
    const prepared: { index: number; input: InsertTreeInput }[] = [];
    for (const [index, item] of request.items.entries()) {
      try {
        if (
          countComponentRows(item) > BULK_LIMITS.MAX_COMPONENT_ROWS_PER_ITEM
        ) {
          throw tooManyComponentRows();
        }
        const { stored } = await this.commands.prepareCreate(
          actor,
          slug,
          asTree(item),
        );
        prepared.push({
          index,
          input: {
            ...stored,
            documentId: randomUUID(),
            publishedAt: type.definition.draftAndPublish
              ? null
              : new Date(this.clock.now()),
            createdBy: actor.accountId,
          },
        });
      } catch (error) {
        const itemFailure = asItemError(error);
        if (itemFailure === null) throw error;
        if (request.atomic) throw atomicFailure(index, itemFailure);
        errors.set(index, itemFailure);
      }
    }

    await mapContentErrors(() =>
      this.transactions.run((unit) =>
        this.documents.insertTrees(
          unit,
          slug,
          prepared.map(({ input }) => input),
        ),
      ),
    );

    const created = new Map(
      prepared.map(({ index, input }) => [index, input.documentId]),
    );
    return this.response(
      request.atomic,
      request.items.map((_, index): BulkItemResult => {
        const documentId = created.get(index);
        if (documentId !== undefined) {
          return {
            index,
            status: BULK_ITEM_STATUS.OK,
            documentId,
            version: 1,
          };
        }
        return itemError(index, errors.get(index) as DomainError);
      }),
    );
  }

  publish(
    actor: ActorContext,
    slug: string,
    request: BulkRequest<PublishItem>,
  ): Promise<BulkResponse> {
    return this.run(
      actor,
      slug,
      'publish',
      request,
      (item) => item.documentId,
      async (unit, scope, item) => ({
        version: await this.publishing.publishIn(
          unit,
          scope,
          slug,
          item.documentId,
          item.expectedVersion,
        ),
      }),
    );
  }

  unpublish(
    actor: ActorContext,
    slug: string,
    request: BulkRequest<string>,
  ): Promise<BulkResponse> {
    return this.run(
      actor,
      slug,
      'unpublish',
      request,
      (id) => id,
      async (unit, scope, id) => {
        await this.publishing.unpublishIn(unit, scope, id);
        return {};
      },
    );
  }

  remove(
    actor: ActorContext,
    slug: string,
    request: BulkRequest<string>,
  ): Promise<BulkResponse> {
    return this.run(
      actor,
      slug,
      'delete',
      request,
      (id) => id,
      async (unit, scope, id) => {
        await this.publishing.removeIn(unit, scope, id);
        return {};
      },
    );
  }

  /** publish / unpublish / delete: one transaction, savepoint per item unless atomic. */
  private async run<Item>(
    actor: ActorContext,
    slug: string,
    operation: Exclude<BulkOperation, 'create'>,
    request: BulkRequest<Item>,
    idOf: (item: Item) => string,
    apply: (
      unit: UnitOfWork,
      scope: ActionScope,
      item: Item,
    ) => Promise<{ version?: number }>,
  ): Promise<BulkResponse> {
    this.assertWriter(actor);
    await this.collection(slug);
    const action = ACTIONS[operation];
    const scope = await this.publishing.begin(
      actor,
      slug,
      action,
      operation !== 'delete',
    );

    const results = await this.transactions.run(async (unit) => {
      const items: BulkItemResult[] = [];
      for (const [index, item] of request.items.entries()) {
        try {
          const outcome = request.atomic
            ? await apply(unit, scope, item)
            : await this.transactions.runInSavepoint(unit, (itemUnit) =>
                apply(itemUnit, scope, item),
              );
          items.push({
            index,
            status: BULK_ITEM_STATUS.OK,
            documentId: idOf(item),
            ...outcome,
          });
        } catch (error) {
          const itemFailure = asItemError(error);
          if (itemFailure === null) throw error;
          if (request.atomic) throw atomicFailure(index, itemFailure);
          items.push(itemError(index, itemFailure));
        }
      }
      return items;
    });

    for (const result of results) {
      if (result.status === BULK_ITEM_STATUS.OK) {
        await this.publishing.track(
          actor,
          operation,
          slug,
          result.documentId,
          result.version,
        );
      }
    }
    return this.response(request.atomic, results);
  }

  private response(atomic: boolean, results: BulkItemResult[]): BulkResponse {
    const failed = results.filter(
      (result) => result.status === BULK_ITEM_STATUS.ERROR,
    ).length;
    return { atomic, succeeded: results.length - failed, failed, results };
  }

  private assertWriter(
    actor: ActorContext,
  ): asserts actor is Extract<ActorContext, { accountId: number }> {
    if (actor.kind === 'anonymous' || actor.kind === 'reviewer') {
      throw forbidden();
    }
  }

  /** The registered type; 404 unknown, 400 unless a collection. */
  private async collection(slug: string) {
    const { catalog } = await this.access.policy();
    if (!catalog.isContentType(slug)) throw unknownContentType();
    const type = (await this.registry.registry()).resolve(slug);
    if (type.definition.kind !== 'collection') {
      throw bulkNotCollection();
    }
    return type;
  }
}

const ACTIONS = {
  publish: PermissionAction.publish,
  unpublish: PermissionAction.unpublish,
  delete: PermissionAction.delete,
} as const;

/** A create item must be an object; anything else is that item's 400. */
function asTree(item: unknown): Record<string, unknown> {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    throw invalidBody();
  }
  return item as Record<string, unknown>;
}
