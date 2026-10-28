import { contentListPath } from '../../config/App.routes';
import type {
  FeatureNavItem,
  NavItemsState,
} from '../../lib/FeatureDefinition';
import {
  CONTENT_WILDCARD_SUBJECT,
  type PermissionAction,
  useCallerAccess,
} from '../access';
import type { ContentType } from '../content-types';
import { useContentTypesQuery } from './Content.queries';
import { NAV_SECTION_BY_KIND } from './Content.constants';

/**
 * One item per content type the caller may read, under the section of its
 * kind. `subject` names the permission that grants the link, so the shell's
 * own check agrees with this one.
 */
export function contentNavItemsOf(
  types: readonly ContentType[],
  can: (subject: string, action: PermissionAction) => boolean,
): FeatureNavItem[] {
  return types.flatMap((type) => {
    const section = NAV_SECTION_BY_KIND[type.kind];
    const subject = [type.slug, CONTENT_WILDCARD_SUBJECT].find((candidate) =>
      can(candidate, 'read'),
    );
    if (section === undefined || subject === undefined) return [];
    return [
      {
        label: type.slug,
        path: contentListPath(type.slug),
        section,
        subject,
        action: 'read' as const,
      },
    ];
  });
}

/** `contentFeature.useNavItems`: no items until permissions and the catalog are in. */
export function useContentNavItems(): NavItemsState {
  const caller = useCallerAccess();
  const types = useContentTypesQuery();
  const isReady = caller.isReady && types.data !== undefined;
  return {
    items: isReady ? contentNavItemsOf(types.data, caller.can) : [],
    isLoading: !caller.isReady || types.isPending,
    hasFailed: types.isError,
    retry: () => void types.refetch(),
  };
}
