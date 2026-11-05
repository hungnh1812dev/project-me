import { AppShell } from '@components/layouts/AppShell';
import { ScreenTextBoundary } from '@components/ScreenTextBoundary';
import { APP_ROUTES } from '@configs/App.routes';
import { ProtectedRoute } from '@features/auth/ProtectedRoute';
import { APP_NAV, PUBLIC_ROUTE_PATHS, VIEWS, type View } from '@views/Views.registry';
import { Navigate, type RouteObject } from 'react-router';

const isPublic = ({ path }: View) => path !== undefined && PUBLIC_ROUTE_PATHS.includes(path);

const toRouteObject = ({ path, Component, textScreens }: View): RouteObject => {
  const element = (
    <ScreenTextBoundary screens={textScreens}>
      <Component />
    </ScreenTextBoundary>
  );
  return path === undefined ? { index: true, element } : { path, element };
};

/** Public routes, then every other view behind sign-in, then the catch-all last. */
export const appRoutes: RouteObject[] = [
  ...VIEWS.filter(isPublic).map(toRouteObject),
  {
    Component: ProtectedRoute,
    children: [
      {
        element: <AppShell nav={APP_NAV} />,
        children: VIEWS.filter((view) => !isPublic(view)).map(toRouteObject),
      },
    ],
  },
  { path: '*', element: <Navigate to={APP_ROUTES.HOME} replace /> },
];
