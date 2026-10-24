import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'kysely';

import {
  ERROR_CODE_BY_STATUS,
  ERROR_CODES,
} from '../../common/constants/error.constants';
import { PermissionAction } from '../../generated/prisma/client';
import { AccessPolicyService, type ActorContext } from '../access';
import { ContentDbProvider } from '../content-engine';
import { ContentRegistryProvider } from '../content-engine';
import {
  ContentRepository,
  type InsertTreeInput,
} from '../content-engine/content.repository';
import { ContentTreeError } from '../content-engine';
import {
  BULK_ITEM_STATUS,
  BULK_LIMITS,
  BULK_MESSAGES,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_ERROR_MESSAGES,
  type BulkOperation,
} from './documents.constants';
import { DocumentsCommandService } from './documents.command.service';
import {
  type BulkRequest,
  countComponentRows,
  type PublishItem,
} from './dto/bulk.body';
import { type ActionScope, PublishService } from './publish.service';

/** Name of the per-item savepoint of a non-atomic bulk request. */
const ITEM_SAVEPOINT = 'bulk_item';

export interface BulkItemOk {
  index: number;
  status: typeof BULK_ITEM_STATUS.OK;
  documentId: string;
  /** Version of the draft (create: 1; publish: the published draft version). */
  version?: number;
}

export interface BulkItemError {
  index: number;
  status: typeof BULK_ITEM_STATUS.ERROR;
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
}

export type BulkItemResult = BulkItemOk | BulkItemError;

export interface BulkResponse {
  atomic: boolean;
  succeeded: number;
  failed: number;
  results: BulkItemResult[];
}

interface ErrorParts {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
}

function errorParts(error: HttpException): ErrorParts {
  const statusCode = error.getStatus();
  const response = error.getResponse();
  const object =
    typeof response === 'object' && response !== null
      ? (response as Record<string, unknown>)
      : {};
  const message =
    typeof object.message === 'string'
      ? object.message
      : Array.isArray(object.message)
        ? object.message.filter((m) => typeof m === 'string').join('; ')
        : error.message;
  return {
    statusCode,
    errorCode:
      typeof object.errorCode === 'string'
        ? object.errorCode
        : (ERROR_CODE_BY_STATUS[statusCode] ?? ERROR_CODES.HTTP_ERROR),
    message,
    ...(object.details === undefined ? {} : { details: object.details }),
  };
}

/** A client error of one item; a server error is never an item result. */
function asItemError(error: unknown): ErrorParts | null {
  if (!(error instanceof HttpException)) return null;
  const parts = errorParts(error);
  return parts.statusCode >= 500 ? null : parts;
}

/** Atomic mode: the request fails with the first item's error, naming the item. */
function atomicFailure(index: number, parts: ErrorParts): HttpException {
  return new HttpException(
    {
      errorCode: parts.errorCode,
      message: parts.message,
      details: { index, details: parts.details },
    },
    parts.statusCode,
  );
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
    private readonly registry: ContentRegistryProvider,
    private readonly content: ContentDbProvider,
    private readonly commands: DocumentsCommandService,
    private readonly publishing: PublishService,
  ) {}

  async create(
    actor: ActorContext,
    slug: string,
    request: BulkRequest<unknown>,
  ): Promise<BulkResponse> {
    this.assertWriter(actor);
    const { evaluator } = await this.access.policy();
    if (!evaluator.can(actor, PermissionAction.create, slug)) {
      throw new ForbiddenException();
    }
    const type = await this.collection(slug);

    const errors = new Map<number, ErrorParts>();
    const prepared: { index: number; input: InsertTreeInput }[] = [];
    for (const [index, item] of request.items.entries()) {
      try {
        if (
          countComponentRows(item) > BULK_LIMITS.MAX_COMPONENT_ROWS_PER_ITEM
        ) {
          throw new BadRequestException({
            errorCode: DOCUMENT_ERROR_CODES.BULK_LIMIT,
            message: BULK_MESSAGES.TOO_MANY_COMPONENT_ROWS,
          });
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
            publishedAt: type.definition.draftAndPublish ? null : new Date(),
            createdBy: actor.accountId,
          },
        });
      } catch (error) {
        const parts = asItemError(error);
        if (parts === null) throw error;
        if (request.atomic) throw atomicFailure(index, parts);
        errors.set(index, parts);
      }
    }

    const repository = new ContentRepository(await this.registry.registry());
    try {
      await this.content.db.transaction().execute((trx) =>
        repository.insertTrees(
          trx,
          slug,
          prepared.map(({ input }) => input),
        ),
      );
    } catch (error) {
      if (error instanceof ContentTreeError) {
        throw new BadRequestException({
          errorCode: error.code,
          message: error.message,
        });
      }
      throw error;
    }

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
        return itemError(index, errors.get(index) as ErrorParts);
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
      async (trx, scope, item) => ({
        version: await this.publishing.publishIn(
          trx,
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
      async (trx, scope, id) => {
        await this.publishing.unpublishIn(trx, scope, id);
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
      async (trx, scope, id) => {
        await this.publishing.removeIn(trx, scope, id);
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
      trx: Parameters<PublishService['removeIn']>[0],
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

    const results: BulkItemResult[] = [];
    const trx = await this.content.db.startTransaction().execute();
    try {
      for (const [index, item] of request.items.entries()) {
        if (!request.atomic)
          await sql`savepoint ${sql.id(ITEM_SAVEPOINT)}`.execute(trx);
        try {
          const outcome = await apply(trx, scope, item);
          if (!request.atomic) {
            await sql`release savepoint ${sql.id(ITEM_SAVEPOINT)}`.execute(trx);
          }
          results.push({
            index,
            status: BULK_ITEM_STATUS.OK,
            documentId: idOf(item),
            ...outcome,
          });
        } catch (error) {
          const parts = asItemError(error);
          if (parts === null) throw error;
          if (request.atomic) throw atomicFailure(index, parts);
          await sql`rollback to savepoint ${sql.id(ITEM_SAVEPOINT)}`.execute(
            trx,
          );
          results.push(itemError(index, parts));
        }
      }
      await trx.commit().execute();
    } catch (error) {
      await trx.rollback().execute();
      throw error;
    }

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
      throw new ForbiddenException();
    }
  }

  /** The registered type; 404 unknown, 400 unless a collection. */
  private async collection(slug: string) {
    const { catalog } = await this.access.policy();
    if (!catalog.isContentType(slug)) throw new NotFoundException();
    const type = (await this.registry.registry()).resolve(slug);
    if (type.definition.kind !== 'collection') {
      throw new BadRequestException({
        errorCode: DOCUMENT_ERROR_CODES.BULK_NOT_COLLECTION,
        message: DOCUMENT_ERROR_MESSAGES.BULK_NOT_COLLECTION,
      });
    }
    return type;
  }
}

const ACTIONS = {
  publish: PermissionAction.publish,
  unpublish: PermissionAction.unpublish,
  delete: PermissionAction.delete,
} as const;

function itemError(index: number, parts: ErrorParts): BulkItemError {
  return { index, status: BULK_ITEM_STATUS.ERROR, ...parts };
}

/** A create item must be an object; anything else is that item's 400. */
function asTree(item: unknown): Record<string, unknown> {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    throw new BadRequestException({
      errorCode: ERROR_CODES.BAD_REQUEST,
      message: DOCUMENT_ERROR_MESSAGES.INVALID_BODY,
    });
  }
  return item as Record<string, unknown>;
}
