import { Navigate, Route, Routes } from 'react-router';

import { APP_ROUTES } from '../config/routes';
import {
  AccountsPage,
  ApiTokensPage,
  RolePermissionsPage,
  RolesPage,
} from '../features/access';
import { LoginPage } from '../features/auth/LoginPage';
import { CollectionListPage, DocumentEditPage } from '../features/content';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { OwnerSetupPage } from '../features/auth/OwnerSetupPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { SetPasswordPage } from '../features/auth/SetPasswordPage';
import { MediaLibraryPage } from '../features/media';
import { ReviewerSessionsPage } from '../features/reviewer';
import { SecuritySettingsPage } from '../features/security';
import { StatusPage } from '../features/status/StatusPage';
import { AppShell } from './AppShell';

export function App() {
  return (
    <Routes>
      <Route path={APP_ROUTES.LOGIN} element={<LoginPage />} />
      <Route path={APP_ROUTES.SETUP} element={<OwnerSetupPage />} />
      <Route path={APP_ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
      <Route path={APP_ROUTES.SET_PASSWORD} element={<SetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<StatusPage />} />
          <Route path={APP_ROUTES.ACCOUNTS} element={<AccountsPage />} />
          <Route path={APP_ROUTES.ROLES} element={<RolesPage />} />
          <Route path={APP_ROUTES.API_TOKENS} element={<ApiTokensPage />} />
          <Route path={APP_ROUTES.MEDIA} element={<MediaLibraryPage />} />
          <Route
            path={APP_ROUTES.REVIEWER_SESSIONS}
            element={<ReviewerSessionsPage />}
          />
          <Route
            path={APP_ROUTES.CONTENT_LIST}
            element={<CollectionListPage />}
          />
          <Route path={APP_ROUTES.CONTENT_NEW} element={<DocumentEditPage />} />
          <Route
            path={APP_ROUTES.CONTENT_EDIT}
            element={<DocumentEditPage />}
          />
          <Route
            path={APP_ROUTES.ROLE_PERMISSIONS}
            element={<RolePermissionsPage />}
          />
          <Route
            path={APP_ROUTES.SECURITY_SETTINGS}
            element={<SecuritySettingsPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={APP_ROUTES.HOME} replace />} />
    </Routes>
  );
}
