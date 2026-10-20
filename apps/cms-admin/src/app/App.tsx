import { Navigate, Route, Routes } from 'react-router';

import { APP_ROUTES } from '../config/routes';
import { LoginPage } from '../features/auth/LoginPage';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SetPasswordPage } from '../features/auth/SetPasswordPage';
import { StatusPage } from '../features/status/StatusPage';
import { AppShell } from './AppShell';

export function App() {
  return (
    <Routes>
      <Route path={APP_ROUTES.LOGIN} element={<LoginPage />} />
      <Route path={APP_ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
      <Route path={APP_ROUTES.SET_PASSWORD} element={<SetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<StatusPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={APP_ROUTES.HOME} replace />} />
    </Routes>
  );
}
