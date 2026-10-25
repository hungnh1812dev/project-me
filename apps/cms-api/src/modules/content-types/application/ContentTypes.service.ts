import { Injectable } from '@nestjs/common';

import {
  type AccessPolicy,
  AccessPolicyService,
  RECORD_SYSTEM_FIELDS,
  type ActorContext,
  FieldSelection,
  joinFieldPath,
  CONDITION_SYSTEM_FIELDS,
  PermissionAction,
  recordReadAccess,
} from '../../access';
import { contentTypeNotFound } from '../domain/ContentTypes.errors';
import {
  type ContentTypeView,
  contentTypeView,
  type FieldVisibility,
  type ViewVocabulary,
} from '../domain/ContentTypeView.rules';
import { FULL_CATALOG_PERMISSION } from './ContentTypes.constants';

const VIEW_VOCABULARY: ViewVocabulary = {
  systemConditionFields: CONDITION_SYSTEM_FIELDS,
  joinFieldPath,
};

const FULL_VISIBILITY: FieldVisibility = {
  fields: FieldSelection.ALL,
  systemFields: new Set(RECORD_SYSTEM_FIELDS),
};

/**
 * SPEC §9 content types: the registered types and their field paths,
 * filtered to what the caller may read. Role managers see the whole catalog
 * (FULL_CATALOG_PERMISSION) so they can build permission matrices.
 */
@Injectable()
export class ContentTypesService {
  constructor(private readonly access: AccessPolicyService) {}

  async list(actor: ActorContext): Promise<ContentTypeView[]> {
    const policy = await this.access.policy();
    return policy.catalog
      .contentTypeSlugs()
      .toSorted()
      .flatMap((slug) => {
        const view = this.view(policy, actor, slug);
        return view === undefined ? [] : [view];
      });
  }

  /** 404 for an unknown slug and for one the caller cannot read alike. */
  async get(actor: ActorContext, slug: string): Promise<ContentTypeView> {
    const view = this.view(await this.access.policy(), actor, slug);
    if (view === undefined) {
      throw contentTypeNotFound();
    }
    return view;
  }

  /** The slug is only a map key here: never interpolated anywhere. */
  private view(
    { catalog, evaluator }: AccessPolicy,
    actor: ActorContext,
    slug: string,
  ): ContentTypeView | undefined {
    const type = catalog.contentType(slug);
    if (type === undefined) return undefined;
    if (
      evaluator.can(
        actor,
        FULL_CATALOG_PERMISSION.action,
        FULL_CATALOG_PERMISSION.subject,
      )
    ) {
      return contentTypeView(type, catalog, FULL_VISIBILITY, VIEW_VOCABULARY);
    }
    if (!evaluator.can(actor, PermissionAction.read, slug)) return undefined;
    const readable = evaluator.fieldsFor(actor, slug).readable;
    return contentTypeView(
      type,
      catalog,
      recordReadAccess(actor, readable),
      VIEW_VOCABULARY,
    );
  }
}
