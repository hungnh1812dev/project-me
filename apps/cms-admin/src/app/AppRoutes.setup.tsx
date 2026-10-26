import { Navigate, type RouteObject } from 'react-router';

import { APP_ROUTES } from '../config/App.routes';
import { PUBLIC_ROUTE_PATHS } from '../features/auth/Auth.feature';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import type { FeatureRoute } from '../lib/FeatureDefinition';
import { FEATURE_LIST } from '../features/Features.registry';
import { AppShell } from './AppShell';

const isPublic = ({ path }: FeatureRoute) =>
  path !== undefined && PUBLIC_ROUTE_PATHS.includes(path);

const toRouteObject = ({ path, Component }: FeatureRoute): RouteObject =>
  path === undefined ? { index: true, Component } : { path, Component };

const featureRoutes = FEATURE_LIST.flatMap((feature) => feature.routes);

/** Public routes, then every other feature route behind sign-in, then the catch-all last. */
export const appRoutes: RouteObject[] = [
  ...featureRoutes.filter(isPublic).map(toRouteObject),
  {
    Component: ProtectedRoute,
    children: [
      {
        Component: AppShell,
        children: featureRoutes
          .filter((route) => !isPublic(route))
          .map(toRouteObject),
      },
    ],
  },
  { path: '*', element: <Navigate to={APP_ROUTES.HOME} replace /> },
];
