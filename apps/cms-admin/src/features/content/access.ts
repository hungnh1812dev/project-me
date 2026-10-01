import { ApiError } from '@/core/api/apiError';
import { can } from '@/features/auth/permissions/can';
import type { Actor, Decision } from '@/features/auth/permissions/policies';

import type { ContentTypeRef } from './types';

/** Every action `contentTypeAccess` decides, in a stable order. */
export const CONTENT_TYPE_ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'publish',
  'unpublish',
  'bulkCreate',
  'bulkDelete',
  'configureColumns',
] as const;

/** An action on one content type's documents (or, for `configureColumns`, on its list view). */
export type ContentTypeAction = (typeof CONTENT_TYPE_ACTIONS)[number];

/** One `Decision` per action, for one actor and one content type. */
export type ContentTypeAccess = Record<ContentTypeAction, Decision>;

/**
 * Decides every content action for `actor` on the content type `ref`. Pure: document actions use
 * the Phase 1 `document` policy scoped with `contentTypeSlug: ref.slug` (publish and unpublish are
 * denied when `draftToPublish` is false). `bulkCreate` needs `create` and then `publish`, so its
 * reason names the first one missing; `bulkDelete` follows `delete`; `configureColumns` is
 * `content_type:configure`. Client-side defense in depth only: the backend stays the authority.
 */
export function contentTypeAccess(actor: Actor, ref: ContentTypeRef): ContentTypeAccess {
  const attrs = { contentTypeSlug: ref.slug, draftToPublish: ref.draftToPublish };
  const document = (action: string) => can(actor, action, 'document', attrs);

  const create = document('create');
  const publish = document('publish');
  const del = document('delete');
  return {
    read: document('read'),
    create,
    update: document('update'),
    delete: del,
    publish,
    unpublish: document('unpublish'),
    bulkCreate: create.allowed ? publish : create,
    bulkDelete: del,
    configureColumns: can(actor, 'configure', 'content_type'),
  };
}

/** Keeps only the content types whose documents `actor` may read (for building a menu). */
export function filterReadableContentTypes<T extends ContentTypeRef>(
  actor: Actor,
  types: readonly T[],
): T[] {
  return types.filter((type) => contentTypeAccess(actor, type).read.allowed);
}

/**
 * Returns when `decision` is allowed. Otherwise throws `ApiError { status: 403, code:
 * 'ERR_CLIENT_FORBIDDEN', message: reason }`. Mutations call it first, so a denied action sends no
 * request.
 */
export function guard(decision: Decision): void {
  if (decision.allowed) return;
  throw new ApiError({
    status: 403,
    code: 'ERR_CLIENT_FORBIDDEN',
    message: decision.reason ?? 'Forbidden.',
  });
}
