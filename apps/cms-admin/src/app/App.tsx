import { Navigate, Route, Routes } from 'react-router';

import { APP_ROUTES } from '../config/routes';
import { LoginPage } from '../features/auth/LoginPage';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { StatusPage } from '../features/status/StatusPage';
import { AppShell } from './AppShell';

export function App() {
  return (
    <Routes>
      <Route path={APP_ROUTES.LOGIN} element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<StatusPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={APP_ROUTES.HOME} replace />} />
    </Routes>
  );
}
