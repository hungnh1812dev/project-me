import type { ComponentType } from 'react';
import { APP_ROUTES } from '@configs/App.routes';
import { COPY } from '@configs/Copy.constants';
import type { NavItem, NavItemsState, NavSource } from '@configs/NavSections.constants';
import { useBackupsNavItems } from '@features/backups/Backups.queries';
import { useContentNavItems } from '@features/content/useContentNavItems';
import { REVIEWER_SETTINGS_SUBJECT } from '@features/reviewer/Reviewer.constants';

import { AccountsPage } from './accounts/AccountsPage';
import { ApiTokensPage } from './api-tokens/ApiTokensPage';
import { BackupsPage } from './backups/BackupsPage';
import { CollectionListPage } from './collection-list/CollectionListPage';
import { DocumentEditPage } from './document-edit/DocumentEditPage';
import { LoginPage } from './login/LoginPage';
import { MediaLibraryPage } from './media-library/MediaLibraryPage';
import { OwnerSetupPage } from './owner-setup/OwnerSetupPage';
import { ResetPasswordPage } from './reset-password/ResetPasswordPage';
import { ReviewerSessionsPage } from './reviewer-sessions/ReviewerSessionsPage';
import { RolePermissionsPage } from './role-permissions/RolePermissionsPage';
import { RolesPage } from './roles/RolesPage';
import { SecuritySettingsPage } from './security-settings/SecuritySettingsPage';
import { SetPasswordPage } from './set-password/SetPasswordPage';
import { StatusPage } from './status/StatusPage';

/** One routed page and the nav links that lead to it. */
export interface View {
  /** Omit for the index route of the app shell. */
  path?: string;
  Component: ComponentType;
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
  { path: APP_ROUTES.LOGIN, Component: LoginPage },
  { path: APP_ROUTES.SETUP, Component: OwnerSetupPage },
  { path: APP_ROUTES.RESET_PASSWORD, Component: ResetPasswordPage },
  { path: APP_ROUTES.SET_PASSWORD, Component: SetPasswordPage },
  { Component: StatusPage },
  {
    path: APP_ROUTES.ACCOUNTS,
    Component: AccountsPage,
    navItems: [
      {
        label: COPY.access.nav.accounts,
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
    navItems: [
      {
        label: COPY.access.nav.roles,
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
    navItems: [
      {
        label: COPY.access.nav.apiTokens,
        path: APP_ROUTES.API_TOKENS,
        section: 'systemSettings',
        subject: 'api_tokens',
        action: 'read',
      },
    ],
  },
  { path: APP_ROUTES.ROLE_PERMISSIONS, Component: RolePermissionsPage },
  {
    path: APP_ROUTES.MEDIA,
    Component: MediaLibraryPage,
    navItems: [
      {
        label: COPY.access.nav.media,
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
    navItems: [
      {
        label: COPY.access.nav.reviewer,
        path: APP_ROUTES.REVIEWER_SESSIONS,
        section: 'systemSettings',
        subject: REVIEWER_SETTINGS_SUBJECT,
        action: 'read',
      },
    ],
  },
  { path: APP_ROUTES.BACKUPS, Component: BackupsPage, useNavItems: useBackupsNavItems },
  {
    path: APP_ROUTES.CONTENT_LIST,
    Component: CollectionListPage,
    useNavItems: useContentNavItems,
  },
  { path: APP_ROUTES.CONTENT_NEW, Component: DocumentEditPage },
  { path: APP_ROUTES.CONTENT_EDIT, Component: DocumentEditPage },
  { path: APP_ROUTES.SECURITY_SETTINGS, Component: SecuritySettingsPage },
];

export const APP_NAV: NavSource = {
  items: VIEWS.flatMap((view) => view.navItems ?? []),
  hooks: VIEWS.flatMap((view) => (view.useNavItems ? [view.useNavItems] : [])),
};
