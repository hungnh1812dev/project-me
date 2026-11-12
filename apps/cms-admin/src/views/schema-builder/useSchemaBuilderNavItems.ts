import { APP_ROUTES } from '@configs/App.routes';
import { COMMON_TEXT } from '@configs/locales';
import type { NavItem, NavItemsState } from '@configs/NavSections.constants';
import { useCallerAccess } from '@features/access';

/** The owner-only rule has no permission subject; this names the link for the shell's check. */
const SCHEMA_BUILDER_NAV_ITEM: NavItem = {
  label: COMMON_TEXT.nav.schemaBuilder,
  path: APP_ROUTES.SCHEMA_BUILDER,
  section: 'systemSettings',
  subject: 'schema_builder',
  action: 'read',
};

/** The System settings item shows for the owner only and needs no request (SB-1). */
export function useSchemaBuilderNavItems(): NavItemsState {
  const caller = useCallerAccess();
  return {
    items: caller.isOwner ? [SCHEMA_BUILDER_NAV_ITEM] : [],
    isLoading: false,
    hasFailed: false,
    retry: () => undefined,
  };
}
