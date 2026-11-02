import { Inject, Injectable } from '@nestjs/common';

import {
  CONTENT_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import { AccessPolicyService, PermissionAction, type ActorContext } from '../../access';
import type { RegisteredContentType } from '../../content-engine';
import { DOCUMENT_ERROR_MESSAGES } from '../domain/Documents.constants';
import {
  documentNotFound,
  forbidden,
  notModified,
  versionConflict,
} from '../domain/Documents.errors';
import { writesEveryField } from '../domain/PublishState.rules';
import { cloneTree } from '../domain/TreeCloner.rules';
import { DOCUMENT_REPOSITORY, type DocumentRepository } from './Documents.port';
import type { WrittenRef } from './DocumentsCommand.service';
import { PublishService, type ActionScope } from './Publish.service';

/**
 * SPEC §16.3 discard: puts the published tree back into the draft. Needs
 * `update` and write access to every root field, because it overwrites all
 * of them. In one transaction: lock the draft (row conditions, expected
 * version), lock the published row, refuse when nothing differs, replace the
 * draft tree with a copy of the published one (component uids kept), and give
 * both rows draft version + 1. Public reads of the published row do not change.
 */
@Injectable()
export class DiscardService {
  constructor(
    private readonly access: AccessPolicyService,
    private readonly publishing: PublishService,
    @Inject(CONTENT_TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
  ) {}

  async discard(
    actor: ActorContext,
    slug: string,
    documentId: string,
    expectedVersion: number,
  ): Promise<WrittenRef> {
    const scope = await this.publishing.begin(actor, slug, PermissionAction.update, true);
    await this.requireWriteOfEveryField(actor, scope.type);
    const version = await this.transactions.run((unit) =>
      this.discardIn(unit, scope, documentId, expectedVersion),
    );
    await this.publishing.track(actor, 'discard', slug, documentId, version);
    return { documentId, version };
  }

  private async discardIn(
    unit: UnitOfWork,
    scope: ActionScope,
    documentId: string,
    expectedVersion: number,
  ): Promise<number> {
    const { type, rowCondition, accountId } = scope;
    const draft = await this.documents.lockRow(unit, type, {
      documentId,
      status: 'draft',
      rowCondition,
    });
    if (draft === undefined) throw documentNotFound();
    if (draft.version !== expectedVersion) {
      throw versionConflict(DOCUMENT_ERROR_MESSAGES.VERSION_CONFLICT, {
        currentVersion: draft.version,
      });
    }

    const published = await this.documents.lockRow(unit, type, {
      documentId,
      status: 'published',
      rowCondition: null,
    });
    if (published === undefined) throw notModified();
    if (rowCondition !== null) {
      const isInScope = await this.documents.isRowInScope(unit, type, published.id, rowCondition);
      if (!isInScope) throw documentNotFound();
    }
    if (published.version === draft.version) throw notModified();

    const [stored] = await this.documents.loadTrees(unit, type.slug, {
      status: 'published',
      documentIds: [documentId],
    });
    if (stored === undefined) throw documentNotFound();
    await this.documents.replaceTree(
      unit,
      type.slug,
      { documentId, status: 'draft' },
      { ...cloneTree(stored), updatedBy: accountId, restoreComponentUids: true },
    );
    const change = { version: draft.version + 1, updatedBy: accountId };
    await this.documents.setVersionAndEditor(unit, type, draft.id, change);
    await this.documents.setVersionAndEditor(unit, type, published.id, change);
    return change.version;
  }

  private async requireWriteOfEveryField(
    actor: ActorContext,
    type: RegisteredContentType,
  ): Promise<void> {
    const { evaluator } = await this.access.policy();
    const { writable } = evaluator.fieldsFor(actor, type.slug);
    const rootFieldNames = type.definition.fields.map((field) => field.name);
    if (!writesEveryField(writable, rootFieldNames)) throw forbidden();
  }
}
