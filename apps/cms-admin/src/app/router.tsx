import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import RequireAccess from '@/features/auth/components/RequireAccess';
import RequireAuth from '@/features/auth/components/RequireAuth';
import AdminHomePage from '@/pages/admin-home/AdminHomePage';
import ForbiddenPage from '@/pages/forbidden/ForbiddenPage';
import ForgotPasswordPage from '@/pages/forgot-password/ForgotPasswordPage';
import LoginPage from '@/pages/login/LoginPage';
import ProfilePage from '@/pages/profile/ProfilePage';
import RegisterPage from '@/pages/register/RegisterPage';
import ResetPasswordPage from '@/pages/reset-password/ResetPasswordPage';
import UsersPage from '@/pages/users/UsersPage';
import VerifyOtpPage from '@/pages/verify-otp/VerifyOtpPage';

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
      { index: true, element: <AdminHomePage /> },
      { path: 'profile', element: <ProfilePage /> },
      {
        path: 'users',
        element: <RequireAccess permission="user:read" />,
        children: [{ index: true, element: <UsersPage /> }],
      },
    ],
  },
  { path: '*', element: <Navigate to="/admin" replace /> },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
