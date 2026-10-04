import { hasPermission } from '@/features/auth/permissions/permissions';
import type { Actor } from '@/features/auth/permissions/policies';
import { filterReadableContentTypes } from '@/features/content/access';
import type { ContentTypeSummary } from '@/features/content/types';

import { SETTINGS_LINKS, type SettingsLink } from './settingsLinks';

/** A content-type link of the side menu. */
export interface NavLinkItem {
  key: string;
  label: string;
  to: string;
}

/** What the side menu shows for one actor. */
export interface NavModel {
  /** `null` when there is no list to show (no `content_type:read`, loading, or failed). */
  content: { single: NavLinkItem[]; collection: NavLinkItem[] } | null;
  settings: SettingsLink[];
}

const toLink = (type: ContentTypeSummary): NavLinkItem => ({
  key: type.slug,
  label: type.name,
  to: `/admin/content-types/${encodeURIComponent(type.slug)}`,
});

const byName = (a: ContentTypeSummary, b: ContentTypeSummary) => a.name.localeCompare(b.name);

/**
 * Builds the side menu (AC-22, AC-23, AC-25). Pure: content types are kept when the actor may
 * read their documents, sorted by name and split by kind; settings links are kept when
 * `hasPermission` passes. Client-side defense in depth only: routes keep `RequireAccess`.
 */
export function buildNavModel(actor: Actor, types: readonly ContentTypeSummary[] | null): NavModel {
  const readable = types ? filterReadableContentTypes(actor, types).sort(byName) : null;
  return {
    content: readable && {
      single: readable.filter((t) => t.kind === 'single').map(toLink),
      collection: readable.filter((t) => t.kind === 'collection').map(toLink),
    },
    settings: SETTINGS_LINKS.filter((link) => hasPermission(actor.permissions, link.permission)),
  };
}
