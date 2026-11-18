import type { ComponentType } from 'react';
import { APP_ROUTES } from '@configs/App.routes';
import { COMMON_TEXT, type ScreenName } from '@configs/locales';
import type { NavItem, NavItemsState, NavSource } from '@configs/NavSections.constants';
import { useBackupsNavItems } from '@features/backups/Backups.queries';
import { useContentNavItems } from '@features/content/useContentNavItems';
import { REVIEWER_SETTINGS_SUBJECT } from '@features/reviewer/Reviewer.constants';

import { AccountsPage } from './accounts/AccountsPage';
import { ApiTokensPage } from './api-tokens/ApiTokensPage';
import { BackupsPage } from './backups/BackupsPage';
import { ChangePasswordPage } from './change-password/ChangePasswordPage';
import { CollectionListPage } from './collection-list/CollectionListPage';
import { DocumentEditPage } from './document-edit/DocumentEditPage';
import { LoginPage } from './login/LoginPage';
import { MediaLibraryPage } from './media-library/MediaLibraryPage';
import { OwnerSetupPage } from './owner-setup/OwnerSetupPage';
import { ProfilePage } from './profile/ProfilePage';
import { ResetPasswordPage } from './reset-password/ResetPasswordPage';
import { ReviewerSessionsPage } from './reviewer-sessions/ReviewerSessionsPage';
import { RolePermissionsPage } from './role-permissions/RolePermissionsPage';
import { RolesPage } from './roles/RolesPage';
import { SchemaBuilderPage } from './schema-builder/SchemaBuilderPage';
import { useSchemaBuilderNavItems } from './schema-builder/useSchemaBuilderNavItems';
import { SecuritySettingsPage } from './security-settings/SecuritySettingsPage';
import { SetPasswordPage } from './set-password/SetPasswordPage';
import { StatusPage } from './status/StatusPage';

/** One routed page and the nav links that lead to it. */
export interface View {
  /** Omit for the index route of the app shell. */
  path?: string;
  Component: ComponentType;
  /** Screen text the page needs; the route waits for it before rendering. */
  textScreens?: readonly ScreenName[];
  navItems?: readonly NavItem[];
  /** Items that depend on loaded data; a hook, so it may call queries. */
  useNavItems?: () => NavItemsState;
}

/**
 * The only routes reachable without a session. Every other route sits behind
 * ProtectedRoute, so a new route is protected unless it is added here.
 */
export const PUBLIC_ROUTE_PATHS: readonly string[] = [
  APP_ROUTES.LOGIN,
  APP_ROUTES.SETUP,
  APP_ROUTES.RESET_PASSWORD,
  APP_ROUTES.SET_PASSWORD,
];

/** Every page. Adding a page is its `views/<page>/` folder plus one entry here; the nav order follows this order. */
export const VIEWS: readonly View[] = [
  { path: APP_ROUTES.LOGIN, Component: LoginPage, textScreens: ['login'] },
  { path: APP_ROUTES.SETUP, Component: OwnerSetupPage, textScreens: ['setup'] },
  { path: APP_ROUTES.RESET_PASSWORD, Component: ResetPasswordPage },
  { path: APP_ROUTES.SET_PASSWORD, Component: SetPasswordPage },
  { Component: StatusPage, textScreens: ['status'] },
  {
    path: APP_ROUTES.ACCOUNTS,
    Component: AccountsPage,
    textScreens: ['access'],
    navItems: [
      {
        label: COMMON_TEXT.nav.accounts,
        path: APP_ROUTES.ACCOUNTS,
        section: 'systemSettings',
        subject: 'accounts',
        action: 'read',
      },
    ],
  },
  {
    path: APP_ROUTES.ROLES,
    Component: RolesPage,
    textScreens: ['access'],
    navItems: [
      {
        label: COMMON_TEXT.nav.roles,
        path: APP_ROUTES.ROLES,
        section: 'systemSettings',
        subject: 'roles',
        action: 'read',
      },
    ],
  },
  {
    path: APP_ROUTES.API_TOKENS,
    Component: ApiTokensPage,
    textScreens: ['access'],
    navItems: [
      {
        label: COMMON_TEXT.nav.apiTokens,
        path: APP_ROUTES.API_TOKENS,
        section: 'systemSettings',
        subject: 'api_tokens',
        action: 'read',
      },
    ],
  },
  { path: APP_ROUTES.ROLE_PERMISSIONS, Component: RolePermissionsPage, textScreens: ['access'] },
  {
    path: APP_ROUTES.MEDIA,
    Component: MediaLibraryPage,
    textScreens: ['media', 'access'],
    navItems: [
      {
        label: COMMON_TEXT.nav.media,
        path: APP_ROUTES.MEDIA,
        section: 'utilities',
        subject: 'media',
        action: 'read',
      },
    ],
  },
  {
    path: APP_ROUTES.REVIEWER_SESSIONS,
    Component: ReviewerSessionsPage,
    textScreens: ['reviewer', 'access'],
    navItems: [
      {
        label: COMMON_TEXT.nav.reviewer,
        path: APP_ROUTES.REVIEWER_SESSIONS,
        section: 'systemSettings',
        subject: REVIEWER_SETTINGS_SUBJECT,
        action: 'read',
      },
    ],
  },
  {
    path: APP_ROUTES.BACKUPS,
    Component: BackupsPage,
    textScreens: ['backups', 'security'],
    useNavItems: useBackupsNavItems,
  },
  {
    path: APP_ROUTES.SCHEMA_BUILDER,
    Component: SchemaBuilderPage,
    textScreens: ['schemaBuilder'],
    useNavItems: useSchemaBuilderNavItems,
  },
  {
    path: APP_ROUTES.CONTENT_LIST,
    Component: CollectionListPage,
    textScreens: ['content'],
    useNavItems: useContentNavItems,
  },
  {
    path: APP_ROUTES.CONTENT_NEW,
    Component: DocumentEditPage,
    textScreens: ['content', 'media', 'access'],
  },
  {
    path: APP_ROUTES.CONTENT_EDIT,
    Component: DocumentEditPage,
    textScreens: ['content', 'media', 'access'],
  },
  { path: APP_ROUTES.PROFILE, Component: ProfilePage, textScreens: ['security'] },
  { path: APP_ROUTES.CHANGE_PASSWORD, Component: ChangePasswordPage, textScreens: ['security'] },
  {
    path: APP_ROUTES.SECURITY_SETTINGS,
    Component: SecuritySettingsPage,
    textScreens: ['security'],
  },
];

export const APP_NAV: NavSource = {
  items: VIEWS.flatMap((view) => view.navItems ?? []),
  hooks: VIEWS.flatMap((view) => (view.useNavItems ? [view.useNavItems] : [])),
};
