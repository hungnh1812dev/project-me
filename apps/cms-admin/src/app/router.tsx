import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import RequireAccess from '@/features/auth/components/RequireAccess';
import RequireAuth from '@/features/auth/components/RequireAuth';
import AppShell from '@/features/shell/components/AppShell';
import { SETTINGS_LINKS } from '@/features/shell/settingsLinks';
import AdminHomePage from '@/pages/admin-home/AdminHomePage';
import ContentTypePage from '@/pages/content-types/ContentTypePage';
import ContentTypesPage from '@/pages/content-types/ContentTypesPage';
import ForbiddenPage from '@/pages/forbidden/ForbiddenPage';
import ForgotPasswordPage from '@/pages/forgot-password/ForgotPasswordPage';
import LoginPage from '@/pages/login/LoginPage';
import ProfilePage from '@/pages/profile/ProfilePage';
import RegisterPage from '@/pages/register/RegisterPage';
import ResetPasswordPage from '@/pages/reset-password/ResetPasswordPage';
import AccessTokensPage from '@/pages/settings/AccessTokensPage';
import PermissionsPage from '@/pages/settings/PermissionsPage';
import RolesPage from '@/pages/settings/RolesPage';
import SettingsPlaceholderPage from '@/pages/settings/SettingsPlaceholderPage';
import UsersPage from '@/pages/settings/UsersPage';
import VerifyOtpPage from '@/pages/verify-otp/VerifyOtpPage';

/**
 * Dev-only showcase of the base inputs. Registered only when `import.meta.env.DEV`, and loaded
 * lazily, so production builds drop it entirely.
 */
const uiKitRoute: RouteObject = {
  path: 'dev/ui-kit',
  // Shown while the lazy chunk loads on a first visit straight to this URL.
  HydrateFallback: () => null,
  lazy: async () => ({ Component: (await import('@/pages/dev/UiKitPage')).default }),
};

/**
 * The real page of each `SETTINGS_LINKS` key. A key without a page still renders the placeholder
 * until its small phase lands (AC-1).
 */
const SETTINGS_PAGES: Partial<Record<string, ComponentType>> = {
  users: UsersPage,
  roles: RolesPage,
  permissions: PermissionsPage,
  'access-tokens': AccessTokensPage,
};

const settingsPage = (key: string, label: string) => {
  const Page = SETTINGS_PAGES[key];
  return Page ? <Page /> : <SettingsPlaceholderPage label={label} />;
};

/** The app's route table. Tests mount it in a memory router. */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/verify-otp', element: <VerifyOtpPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/403', element: <ForbiddenPage /> },
  {
    path: '/admin',
    element: <RequireAuth />,
    children: [
      {
        // The shell wraps every signed-in page; /403 and the public pages stay outside it.
        element: <AppShell />,
        children: [
          { index: true, element: <AdminHomePage /> },
          { path: 'profile', element: <ProfilePage /> },
          // The old users path (Phase 1) now lives under settings (AC-26).
          { path: 'users', element: <Navigate to="/admin/settings/users" replace /> },
          {
            path: 'settings',
            children: SETTINGS_LINKS.map((link) => ({
              path: link.key,
              element: <RequireAccess permission={link.permission} />,
              children: [{ index: true, element: settingsPage(link.key, link.label) }],
            })),
          },
          {
            path: 'content-types',
            element: <RequireAccess can={{ I: 'read', a: 'content_type' }} />,
            children: [
              { index: true, element: <ContentTypesPage /> },
              { path: ':slug', element: <ContentTypePage /> },
            ],
          },
          ...(import.meta.env.DEV ? [uiKitRoute] : []),
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/admin" replace /> },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
