import { useRoutes } from 'react-router';

import { appRoutes } from './app-routes';

export function App() {
  return useRoutes(appRoutes);
}
