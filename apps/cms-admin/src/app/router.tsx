import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import RequireAccess from '@/features/auth/components/RequireAccess';
import RequireAuth from '@/features/auth/components/RequireAuth';
import AppShell from '@/features/shell/components/AppShell';
import AdminHomePage from '@/pages/admin-home/AdminHomePage';
import ContentTypePage from '@/pages/content-types/ContentTypePage';
import ContentTypesPage from '@/pages/content-types/ContentTypesPage';
import ForbiddenPage from '@/pages/forbidden/ForbiddenPage';
import ForgotPasswordPage from '@/pages/forgot-password/ForgotPasswordPage';
import LoginPage from '@/pages/login/LoginPage';
import ProfilePage from '@/pages/profile/ProfilePage';
import RegisterPage from '@/pages/register/RegisterPage';
import ResetPasswordPage from '@/pages/reset-password/ResetPasswordPage';
import UsersPage from '@/pages/users/UsersPage';
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
          {
            path: 'users',
            element: <RequireAccess permission="user:read" />,
            children: [{ index: true, element: <UsersPage /> }],
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
