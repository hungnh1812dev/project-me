import { COPY } from '../../config/copy.constants';
import { APP_ROUTES } from '../../config/routes';
import { defineApiService, type Feature } from '../../lib/feature-definition';
import { AccessApiProvider } from './access-api-context';
import { createAccessApi } from './access.api';
import { AccountsPage } from './AccountsPage';
import { ApiTokensPage } from './ApiTokensPage';
import { RolePermissionsPage } from './RolePermissionsPage';
import { RolesPage } from './RolesPage';

export const accessFeature: Feature = {
  apiServices: [defineApiService(createAccessApi, AccessApiProvider)],
  routes: [
    { path: APP_ROUTES.ACCOUNTS, Component: AccountsPage },
    { path: APP_ROUTES.ROLES, Component: RolesPage },
    { path: APP_ROUTES.API_TOKENS, Component: ApiTokensPage },
    { path: APP_ROUTES.ROLE_PERMISSIONS, Component: RolePermissionsPage },
  ],
  navItems: [
    {
      label: COPY.access.nav.accounts,
      path: APP_ROUTES.ACCOUNTS,
      subject: 'accounts',
      action: 'read',
    },
    {
      label: COPY.access.nav.roles,
      path: APP_ROUTES.ROLES,
      subject: 'roles',
      action: 'read',
    },
    {
      label: COPY.access.nav.apiTokens,
      path: APP_ROUTES.API_TOKENS,
      subject: 'api_tokens',
      action: 'read',
    },
  ],
};
