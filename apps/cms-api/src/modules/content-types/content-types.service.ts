import { Injectable, NotFoundException } from '@nestjs/common';

import { PermissionAction } from '../../generated/prisma/client';
import {
  type AccessPolicy,
  AccessPolicyService,
} from '../access/access-policy.service';
import { RECORD_SYSTEM_FIELDS } from '../access/access.constants';
import type { ActorContext } from '../access/actor-context';
import { FieldSelection } from '../access/policy-evaluator';
import { recordReadAccess } from '../access/record-read-access';
import {
  type ContentTypeView,
  contentTypeView,
  type FieldVisibility,
} from './content-type.view';
import {
  CONTENT_TYPES_ERROR_CODES,
  CONTENT_TYPES_ERROR_MESSAGES,
  FULL_CATALOG_PERMISSION,
} from './content-types.constants';

const FULL_VISIBILITY: FieldVisibility = {
  fields: FieldSelection.ALL,
  systemFields: new Set(RECORD_SYSTEM_FIELDS),
};

/**
 * SPEC §9 content types (T17b): the registered types and their field paths,
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
      throw new NotFoundException({
        errorCode: CONTENT_TYPES_ERROR_CODES.NOT_FOUND,
        message: CONTENT_TYPES_ERROR_MESSAGES.NOT_FOUND,
      });
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
      return contentTypeView(type, catalog, FULL_VISIBILITY);
    }
    if (!evaluator.can(actor, PermissionAction.read, slug)) return undefined;
    const readable = evaluator.fieldsFor(actor, slug).readable;
    return contentTypeView(type, catalog, recordReadAccess(actor, readable));
  }
}
