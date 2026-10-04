import { SETTINGS_LINKS } from './settingsLinks';

/** One breadcrumb. Without `to` it is plain text (the current page, or "Settings"). */
export interface Crumb {
  label: string;
  to?: string;
}

export interface BreadcrumbContext {
  /** The name of the content type on `/admin/content-types/:slug[/…]`, when the cache knows it. */
  contentTypeName?: string;
  /** The entry's label on `/admin/content-types/:slug/:documentId`, when the cache knows it. */
  entryLabel?: string;
}

/** The last crumb of the create page. */
export const NEW_ENTRY = 'New entry';

const HOME_PATH = '/admin';
const CONTENT_TYPES_PATH = '/admin/content-types';

const decode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/** The decoded path segments after `/admin` (all of them for a path outside `/admin`). */
const segmentsOf = (pathname: string): string[] => {
  const inAdmin = pathname === HOME_PATH || pathname.startsWith(`${HOME_PATH}/`);
  const rest = inAdmin ? pathname.slice(HOME_PATH.length) : pathname;
  return rest.split('/').filter(Boolean).map(decode);
};

/** `access-tokens` and `audit_log` become "Access Tokens" and "Audit Log". */
const titleCase = (segment: string): string =>
  segment
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/** The slug of a `/admin/content-types/:slug` path, decoded, or `null` on any other page. */
export function contentTypeSlugOf(pathname: string): string | null {
  const [section, slug] = segmentsOf(pathname);
  return section === 'content-types' && slug ? slug : null;
}

/** The documentId of a `/admin/content-types/:slug/:documentId` path, decoded; `null` elsewhere and on `/new`. */
export function contentDocumentIdOf(pathname: string): string | null {
  const [section, slug, documentId] = segmentsOf(pathname);
  return section === 'content-types' && slug && documentId && documentId !== 'new'
    ? documentId
    : null;
}

/**
 * The breadcrumb trail of a pathname (AC-31, Phase 5 AC-39). The last crumb is the current page and
 * has no `to`. The content-type crumb shows `contentTypeName` when given, and the slug until then.
 * Below it, `/new` adds "New entry", and a document adds `entryLabel` (its documentId until then).
 */
export function buildBreadcrumbs(pathname: string, context: BreadcrumbContext = {}): Crumb[] {
  const segments = segmentsOf(pathname);
  if (segments.length === 0) return [{ label: 'Home' }];

  const home: Crumb = { label: 'Home', to: HOME_PATH };
  const [section, child] = segments;

  if (section === 'profile' && !child) return [home, { label: 'Profile' }];
  if (section === 'content-types') {
    if (!child) return [home, { label: 'Content types' }];
    const contentTypes: Crumb = { label: 'Content types', to: CONTENT_TYPES_PATH };
    const typeLabel = context.contentTypeName ?? child;
    const entry = segments[2];
    if (!entry) return [home, contentTypes, { label: typeLabel }];
    const type: Crumb = {
      label: typeLabel,
      to: `${CONTENT_TYPES_PATH}/${encodeURIComponent(child)}`,
    };
    const last = entry === 'new' ? NEW_ENTRY : (context.entryLabel ?? entry);
    return [home, contentTypes, type, { label: last }];
  }
  if (section === 'settings') {
    const link = SETTINGS_LINKS.find((l) => l.key === child);
    if (link) return [home, { label: 'Settings' }, { label: link.label }];
  }
  if (section === 'dev' && child === 'ui-kit') return [home, { label: 'UI kit' }];

  return [home, { label: titleCase(segments[segments.length - 1]) }];
}
